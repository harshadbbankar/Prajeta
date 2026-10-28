"""Live ride tracking (driver GPS → customer map + ETA) and driver ratings (driver + ERP leaderboard)."""
import math
import secrets
from collections import OrderedDict, defaultdict
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from core import db, now, now_iso, require_customer, require_driver, require_roles, period_range, clean, logger
from logic import BADGES, PRIORITY_MINUTES

router = APIRouter(prefix="/api")

TRACK_STATUSES = ("ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS")
CITY_SPEED_KMPH = 22  # average city driving speed used for ETA
ROAD_FACTOR = 1.35    # straight-line → road distance
STALE_SECONDS = 120
CITY_CENTERS = {
    "mumbai": (19.0760, 72.8777), "pune": (18.5204, 73.8567), "bengaluru": (12.9716, 77.5946),
    "delhi-ncr": (28.6139, 77.2090), "hyderabad": (17.3850, 78.4867), "chennai": (13.0827, 80.2707),
}


def haversine_km(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


async def geocode(address: str, city_id: str, city_name: str) -> Optional[dict]:
    """Address → {lat, lng, approx}. Cached in Mongo; falls back to the city centre."""
    if not address:
        return None
    key = f"{address.strip().lower()}|{city_id}"
    hit = await db.geocode_cache.find_one({"key": key}, {"_id": 0})
    if hit:
        return {"lat": hit["lat"], "lng": hit["lng"], "approx": hit["approx"]}
    point, failed = None, False
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            r = await c.get("https://nominatim.openstreetmap.org/search",
                            params={"q": f"{address}, {city_name}, India", "format": "json", "limit": 1, "countrycodes": "in"},
                            headers={"User-Agent": "Prajeta/1.0 (driver booking app)"})
            data = r.json() if r.status_code == 200 else []
            if data:
                point = {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"]), "approx": False}
    except Exception as e:  # network / rate limit — use city centre
        logger.warning("Geocode failed for %s: %s", address, e)
        failed = True
    if not point:
        c = CITY_CENTERS.get(city_id)
        if not c:
            return None
        point = {"lat": c[0], "lng": c[1], "approx": True}
    else:
        c = CITY_CENTERS.get(city_id)
        if c and haversine_km(c, (point["lat"], point["lng"])) > 80:  # wrong match far outside the city
            point = {"lat": c[0], "lng": c[1], "approx": True}
    if not failed:  # don't pin an address to the city centre because of a temporary outage
        await db.geocode_cache.update_one({"key": key}, {"$set": {"key": key, **point}}, upsert=True)
    return point


# ===================================================================== MAP TILES (OpenStreetMap proxy)
_tiles: "OrderedDict[str, bytes]" = OrderedDict()


@router.get("/tiles/{z}/{x}/{y}.png")
async def tile(z: int, x: int, y: int):
    if not (0 <= z <= 18 and 0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise HTTPException(404, "Tile not found")
    key = f"{z}/{x}/{y}"
    data = _tiles.get(key)
    if data is None:
        try:
            async with httpx.AsyncClient(timeout=8) as c:
                r = await c.get(f"https://tile.openstreetmap.org/{key}.png",
                                headers={"User-Agent": "Prajeta/1.0 (support@prajeta.in)"})
        except Exception:
            raise HTTPException(502, "Map tile unavailable")
        if r.status_code != 200:
            raise HTTPException(502, "Map tile unavailable")
        data = r.content
        _tiles[key] = data
        if len(_tiles) > 3000:
            _tiles.popitem(last=False)
    else:
        _tiles.move_to_end(key)
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=604800"})


# ===================================================================== DRIVER: share location
class LocationIn(BaseModel):
    lat: float
    lng: float
    heading: Optional[float] = None
    speed: Optional[float] = None  # m/s
    accuracy: Optional[float] = None


@router.post("/driver/jobs/{booking_id}/location")
async def share_location(booking_id: str, body: LocationIn, user: dict = Depends(require_driver)):
    if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
        raise HTTPException(400, "Invalid location")
    b = await db.bookings.find_one({"id": booking_id, "driver_id": user["id"]}, {"_id": 0, "status": 1})
    if not b:
        raise HTTPException(404, "Job not found")
    if b["status"] not in TRACK_STATUSES:
        raise HTTPException(400, "Location sharing is only for active trips")
    loc = {"lat": body.lat, "lng": body.lng, "heading": body.heading, "speed": body.speed,
           "accuracy": body.accuracy, "at": now_iso()}
    await db.bookings.update_one({"id": booking_id}, {"$set": {"driver_location": loc}})
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {"last_location": loc}})
    return {"ok": True}


@router.post("/driver/location")
async def presence_location(body: LocationIn, user: dict = Depends(require_driver)):
    """While online (no active trip) — lets dispatch see who is nearest."""
    if not (-90 <= body.lat <= 90 and -180 <= body.lng <= 180):
        raise HTTPException(400, "Invalid location")
    p = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "online": 1, "status": 1})
    if not p or p.get("status") != "APPROVED" or not p.get("online"):
        raise HTTPException(400, "Go online to share your location with dispatch")
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {"last_location": {
        "lat": body.lat, "lng": body.lng, "heading": body.heading, "accuracy": body.accuracy, "at": now_iso()}}})
    return {"ok": True}


def loc_age(loc: Optional[dict]) -> Optional[int]:
    if not loc:
        return None
    return int((now() - datetime.fromisoformat(loc["at"]).astimezone(timezone.utc)).total_seconds())


# ===================================================================== CUSTOMER: track driver
@router.get("/bookings/{booking_id}/tracking")
async def tracking(booking_id: str, user: dict = Depends(require_customer)):
    b = await db.bookings.find_one({"id": booking_id, "customer_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return await tracking_payload(b)


async def tracking_payload(b: dict) -> dict:
    if b["status"] not in TRACK_STATUSES or not b.get("driver_id"):
        return {"active": False, "status": b["status"]}
    pickup = await geocode(b.get("pickup", ""), b["city_id"], b.get("city_name", ""))
    dest = await geocode(b.get("destination", ""), b["city_id"], b.get("city_name", "")) if b.get("destination") else None
    loc = b.get("driver_location")
    out = {"active": True, "status": b["status"], "pickup": pickup, "destination": dest, "driver": None,
           "target": None, "distance_km": None, "eta_mins": None, "stale": True, "updated_secs_ago": None}
    if loc:
        age = (now() - datetime.fromisoformat(loc["at"]).astimezone(timezone.utc)).total_seconds()
        out.update({"driver": {"lat": loc["lat"], "lng": loc["lng"], "heading": loc.get("heading")},
                    "stale": age > STALE_SECONDS, "updated_secs_ago": int(age)})
        target = pickup if b["status"] == "ACCEPTED" else dest if b["status"] == "IN_PROGRESS" else None
        if target:
            km = haversine_km((loc["lat"], loc["lng"]), (target["lat"], target["lng"])) * ROAD_FACTOR
            out.update({"target": "pickup" if b["status"] == "ACCEPTED" else "destination",
                        "distance_km": round(km, 1), "eta_mins": max(1, math.ceil(km / CITY_SPEED_KMPH * 60))})
    return out


# ===================================================================== RATINGS
@router.get("/driver/reviews")
async def my_reviews(user: dict = Depends(require_driver)):
    items = [clean(r) async for r in db.reviews.find({"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1)]
    dist = {str(n): sum(1 for r in items if r["rating"] == n) for n in range(1, 6)}
    avg = round(sum(r["rating"] for r in items) / len(items), 1) if items else None
    tags = defaultdict(int)
    for r in items:
        for t in r.get("tags") or []:
            tags[t] += 1
    recent = [{"rating": r["rating"], "comment": r.get("comment"), "tags": r.get("tags") or [],
               "created_at": r["created_at"]} for r in items[:20]]
    p = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "badge": 1})
    badge = (p or {}).get("badge")
    exact = sum(r["rating"] for r in items) / len(items) if items else None
    nxt = None
    for key in ("top", "gold"):
        if badge == "gold" or (badge == "top" and key == "top"):
            continue
        r = BADGES[key]
        nxt = {"key": key, "label": r["label"], "min_rating": r["min_rating"], "min_reviews": r["min_reviews"],
               "reviews_needed": max(0, r["min_reviews"] - len(items)),
               "rating_ok": exact is not None and exact >= r["min_rating"]}
        break
    return {"average": avg, "count": len(items), "distribution": dist,
            "top_tags": sorted(tags.items(), key=lambda x: -x[1])[:5], "recent": recent,
            "badge": badge, "badge_label": BADGES.get(badge or "", {}).get("label"), "next_badge": nxt,
            "priority_minutes": PRIORITY_MINUTES}


@router.get("/admin/ratings")
async def ratings_leaderboard(period: str = "30d", city_id: str = "", min_reviews: int = 1,
                              user: dict = Depends(require_roles("owner", "super_admin", "ops", "verification"))):
    s, e, _, _ = period_range(period)
    reviews = [r async for r in db.reviews.find({"created_at": {"$gte": s.isoformat(), "$lt": e.isoformat()}}, {"_id": 0})]
    by_driver = defaultdict(list)
    for r in reviews:
        if r.get("driver_id"):
            by_driver[r["driver_id"]].append(r)
    profiles = {p["user_id"]: p async for p in db.driver_profiles.find({"user_id": {"$in": list(by_driver)}}, {"_id": 0, "documents": 0})}
    rows = []
    for did, rs in by_driver.items():
        p = profiles.get(did) or {}
        if city_id and p.get("city_id") != city_id:
            continue
        if len(rs) < max(1, min_reviews):
            continue
        avg = sum(r["rating"] for r in rs) / len(rs)
        completed = await db.bookings.count_documents({"driver_id": did, "status": "COMPLETED",
                                                       "completed_at": {"$gte": s.isoformat(), "$lt": e.isoformat()}})
        tags = defaultdict(int)
        for r in rs:
            for t in r.get("tags") or []:
                tags[t] += 1
        rs.sort(key=lambda r: r["created_at"], reverse=True)
        rows.append({"driver_id": did, "name": p.get("name") or "Driver", "phone": p.get("phone"),
                     "badge": p.get("badge"), "badge_label": BADGES.get(p.get("badge") or "", {}).get("label"),
                     "city_id": p.get("city_id"), "overall_rating": p.get("rating"),
                     "average": round(avg, 2), "count": len(rs), "completed_trips": completed,
                     "five_star_pct": round(100 * sum(1 for r in rs if r["rating"] == 5) / len(rs)),
                     "low_count": sum(1 for r in rs if r["rating"] <= 2),
                     # Bayesian score so a single 5★ does not beat 40 trips at 4.8★
                     "score": round((avg * len(rs) + 4.0 * 5) / (len(rs) + 5), 2),
                     "top_tags": sorted(tags.items(), key=lambda x: -x[1])[:3],
                     "recent": [{"rating": r["rating"], "comment": r.get("comment"), "created_at": r["created_at"]}
                                for r in rs[:3]]})
    rows.sort(key=lambda r: (-r["score"], -r["count"]))
    low = [{"driver_id": r["driver_id"], "name": (profiles.get(r["driver_id"]) or {}).get("name") or "Driver",
            "rating": r["rating"], "comment": r.get("comment"), "booking_id": r["booking_id"], "created_at": r["created_at"]}
           for r in sorted(reviews, key=lambda r: r["created_at"], reverse=True) if r["rating"] <= 2][:20]
    total = len(reviews)
    return {"drivers": rows, "low_ratings": low, "total_reviews": total,
            "average": round(sum(r["rating"] for r in reviews) / total, 2) if total else None,
            "score_formula": "(average × reviews + 4.0 × 5) ÷ (reviews + 5)"}


# ===================================================================== SHARE TRIP LINK (family safety)
SHARE_STATUSES = ("AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS")


@router.post("/bookings/{booking_id}/share")
async def create_share(booking_id: str, user: dict = Depends(require_customer)):
    b = await db.bookings.find_one({"id": booking_id, "customer_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if b["status"] not in SHARE_STATUSES:
        raise HTTPException(400, "You can share a trip once the booking is confirmed and until it ends")
    token = b.get("share_token") or secrets.token_urlsafe(12)
    if not b.get("share_token"):
        await db.bookings.update_one({"id": booking_id}, {"$set": {"share_token": token, "shared_at": now_iso()}})
    return {"token": token, "path": f"/live/{token}"}


@router.delete("/bookings/{booking_id}/share")
async def stop_share(booking_id: str, user: dict = Depends(require_customer)):
    r = await db.bookings.update_one({"id": booking_id, "customer_id": user["id"]}, {"$unset": {"share_token": ""}})
    if not r.matched_count:
        raise HTTPException(404, "Booking not found")
    return {"ok": True}


@router.get("/public/live/{token}")
async def public_live(token: str):
    """Public, no login: limited trip info for family — no phone numbers, OTP or full address."""
    b = await db.bookings.find_one({"share_token": token}, {"_id": 0}) if token else None
    if not b:
        raise HTTPException(404, "This trip link is invalid or has been turned off")
    base = {"ref": b["ref"], "service_name": b["service_name"], "city_name": b.get("city_name"),
            "date": b["date"], "time": b["time"], "status": b["status"],
            "customer_first_name": (b.get("customer_name") or "").split(" ")[0] or None,
            "vehicle": f"{b.get('vehicle_type', '')} · {b.get('transmission', '')}"}
    if b["status"] in ("COMPLETED", "CANCELLED") or b["status"].startswith("NO_SHOW"):
        return {**base, "ended": True, "active": False}
    driver = None
    if b.get("driver_id"):
        p = await db.driver_profiles.find_one({"user_id": b["driver_id"]}, {"_id": 0, "name": 1, "rating": 1, "badge": 1})
        if p:
            driver = {"first_name": (p.get("name") or "Driver").split(" ")[0], "rating": p.get("rating"),
                      "badge_label": BADGES.get(p.get("badge") or "", {}).get("label"), "verified": True}
    t = await tracking_payload(b)
    return {**base, "ended": False, "driver_info": driver, **t}


# ===================================================================== ERP LIVE MAP
@router.get("/admin/live-drivers")
async def live_drivers(city_id: str = "", booking_id: str = "",
                       user: dict = Depends(require_roles("owner", "super_admin", "ops", "support"))):
    from logic import driver_eligibility
    pickup, b = None, None
    if booking_id:
        b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Booking not found")
        city_id = b["city_id"]
        pickup = await geocode(b.get("pickup", ""), b["city_id"], b.get("city_name", ""))
    q = {"status": "APPROVED"}
    if city_id:
        q["city_id"] = city_id
    on_trip = {x["driver_id"]: x async for x in db.bookings.find(
        {"driver_id": {"$ne": None}, "$or": [{"status": {"$in": ["DRIVER_ARRIVED", "IN_PROGRESS"]}},
                                             {"status": "ACCEPTED", "date": {"$lte": now().date().isoformat()}}]},
        {"_id": 0, "driver_id": 1, "ref": 1, "status": 1, "id": 1})}
    rows = []
    async for p in db.driver_profiles.find(q, {"_id": 0}):
        trip = on_trip.get(p["user_id"])
        if not p.get("online") and not trip:
            continue
        loc = p.get("last_location")
        age = loc_age(loc)
        row = {"driver_id": p["user_id"], "name": p.get("name"), "phone": p.get("phone"), "city_id": p.get("city_id"),
               "rating": p.get("rating"), "badge": p.get("badge"),
               "state": "on_trip" if trip else "available", "trip": trip,
               "location": {"lat": loc["lat"], "lng": loc["lng"]} if loc else None,
               "updated_secs_ago": age, "stale": age is None or age > 600, "distance_km": None, "eta_mins": None}
        if pickup and loc:
            km = haversine_km((loc["lat"], loc["lng"]), (pickup["lat"], pickup["lng"])) * ROAD_FACTOR
            row.update({"distance_km": round(km, 1), "eta_mins": max(1, math.ceil(km / CITY_SPEED_KMPH * 60))})
        if b:
            row["reason"] = await driver_eligibility(p, b)
        rows.append(row)
    rows.sort(key=lambda r: (r["location"] is None, r["distance_km"] if r["distance_km"] is not None else 1e9,
                             r["state"] != "available", not r["badge"]))
    return {"drivers": rows, "pickup": pickup, "city_id": city_id,
            "booking": {"id": b["id"], "ref": b["ref"], "status": b["status"], "pickup": b.get("pickup")} if b else None,
            "counts": {"available": sum(1 for r in rows if r["state"] == "available"),
                       "on_trip": sum(1 for r in rows if r["state"] == "on_trip"),
                       "no_location": sum(1 for r in rows if not r["location"])}}
