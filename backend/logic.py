"""Booking domain logic: fares, confirmation, offers, eligibility."""
import math
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException

from core import db, now, now_iso, new_id, notify, notify_admins

ACTIVE_DRIVER_STATUSES = ["ASSIGNED", "ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS"]
OFFER_MINUTES = 30
PRIORITY_MINUTES = 5  # badge holders see broadcast offers this many minutes before everyone else

BADGES = {
    "gold": {"label": "Gold Star Driver", "min_rating": 4.8, "min_reviews": 10},
    "top": {"label": "Top Rated", "min_rating": 4.5, "min_reviews": 5},
}


def badge_for(avg: Optional[float], count: int) -> Optional[str]:
    for key in ("gold", "top"):
        r = BADGES[key]
        if avg is not None and count >= r["min_reviews"] and avg >= r["min_rating"]:
            return key
    return None


async def refresh_driver_badge(driver_id: str) -> Optional[str]:
    """Recompute rating + badge from all reviews; notify the driver when they earn a new badge."""
    if not driver_id:
        return None
    ratings = [r["rating"] async for r in db.reviews.find({"driver_id": driver_id}, {"_id": 0, "rating": 1})]
    avg = sum(ratings) / len(ratings) if ratings else None
    badge = badge_for(avg, len(ratings))
    upd = {"review_count": len(ratings), "badge": badge}
    if avg is not None:
        upd["rating"] = round(avg, 1)
    prev = await db.driver_profiles.find_one_and_update(
        {"user_id": driver_id}, {"$set": upd},
        projection={"_id": 0, "badge": 1})
    if prev is not None and badge and prev.get("badge") != badge and (prev.get("badge") is None or badge == "gold"):
        await notify(driver_id, f"You earned {BADGES[badge]['label']}!",
                     f"Great service is rewarded — you now get new booking offers {PRIORITY_MINUTES} minutes before other drivers.")
    return badge


def is_night(time_str: str) -> bool:
    try:
        h = int(time_str.split(":")[0])
    except Exception:
        return False
    return h >= 22 or h < 6


async def compute_fare(service: dict, city: dict, hours: float, days: int, time_str: str,
                       coupon_code: Optional[str] = None) -> dict:
    """Server-side fare from the active tariff. Returns breakdown in paise or quote_required."""
    settings = await db.system_settings.find_one({"id": "main"}, {"_id": 0}) or {}
    tax_rate = settings.get("tax_rate", 18)
    advance_pct = settings.get("advance_percent", 20)
    if service["pricing_mode"] == "quote":
        return {"quote_required": True, "advance_percent": advance_pct}
    lines = []
    if service["pricing_mode"] == "daily":
        if days and not 1 <= int(days) <= 30:
            raise HTTPException(400, "Outstation trips can be 1 to 30 days")
        days = max(1, int(days or 1))
        base = service["per_day"] * days
        lines.append({"label": f"{days} day(s) × ₹{service['per_day'] // 100}", "amount": base})
        hrs = days * service["base_hours"]
    else:
        if hours and (hours < 0 or (service.get("max_hours") and hours > service["max_hours"])):
            raise HTTPException(400, f"Duration must be between {service['base_hours']} and {service['max_hours']} hours")
        hrs = max(float(hours or service["base_hours"]), float(service["base_hours"]))
        base = service["base_fare"]
        lines.append({"label": f"Base fare (first {service['base_hours']} hrs)", "amount": base})
        extra_hours = hrs - service["base_hours"]
        if extra_hours > 0:
            extra = int(round(extra_hours * service["extra_hour_rate"]))
            lines.append({"label": f"Additional {extra_hours:g} hr(s)", "amount": extra})
            base += extra
    if service.get("night_surcharge") and is_night(time_str) and service["id"] != "night":
        lines.append({"label": "Night surcharge (10 PM – 6 AM)", "amount": service["night_surcharge"]})
        base += service["night_surcharge"]
    mult = city.get("multiplier", 1.0)
    if mult != 1.0:
        adj = int(round(base * (mult - 1)))
        lines.append({"label": f"{city['name']} city adjustment", "amount": adj})
        base += adj
    discount = 0
    coupon_applied = None
    if coupon_code:
        c = await db.coupons.find_one({"code": coupon_code.upper().strip(), "active": True}, {"_id": 0})
        if not c:
            raise HTTPException(400, "Invalid or expired coupon")
        discount = min(int(base * c["percent"] / 100), c.get("max_discount", 10 ** 9))
        coupon_applied = c["code"]
    taxable = base - discount
    tax = int(round(taxable * tax_rate / 100))
    total = taxable + tax
    advance = int(math.ceil(total * advance_pct / 100 / 100.0) * 100)  # rounded up to whole rupee
    return {
        "quote_required": False, "lines": lines, "subtotal": base, "discount": discount, "coupon": coupon_applied,
        "tax_rate": tax_rate, "tax": tax, "total": total, "advance_percent": advance_pct, "advance": advance,
        "hours": hrs, "tariff_version": service.get("tariff_version", 1),
        "cancellation_fee": service.get("cancellation_fee", 0), "extra_hour_rate": service.get("extra_hour_rate", 0),
    }


def apply_quote(amount_paise: int, tax_rate: int, advance_pct: int) -> dict:
    tax = int(round(amount_paise * tax_rate / 100))
    total = amount_paise + tax
    return {
        "quote_required": False, "lines": [{"label": "Quoted service charge", "amount": amount_paise}],
        "subtotal": amount_paise, "discount": 0, "coupon": None, "tax_rate": tax_rate, "tax": tax, "total": total,
        "advance_percent": advance_pct, "advance": int(math.ceil(total * advance_pct / 100 / 100.0) * 100),
        "tariff_version": "quote",
    }


def booking_window(b: dict):
    start = datetime.fromisoformat(f"{b['date']}T{b['time']}")
    hrs = b.get("fare", {}).get("hours") or (b.get("days", 1) * 12 if b.get("days") else b.get("hours", 4))
    return start, start + timedelta(hours=float(hrs or 4))


async def add_event(booking_id: str, event: str, actor: dict, note: str = ""):
    await db.trip_events.insert_one({
        "id": new_id(), "booking_id": booking_id, "event": event, "note": note,
        "actor_id": actor.get("id"), "actor_role": actor.get("role"), "actor_name": actor.get("name"),
        "created_at": now_iso(),
    })


async def driver_conflict(driver_user_id: str, booking: dict) -> bool:
    s, e = booking_window(booking)
    async for other in db.bookings.find({"driver_id": driver_user_id, "status": {"$in": ACTIVE_DRIVER_STATUSES},
                                         "id": {"$ne": booking["id"]}}, {"_id": 0}):
        os_, oe = booking_window(other)
        if s < oe and os_ < e:
            return True
    return False


async def driver_eligibility(profile: dict, booking: dict, require_online: bool = False) -> Optional[str]:
    """Return None if eligible, else a reason."""
    if profile.get("status") != "APPROVED":
        return "Driver is not approved"
    if require_online and not profile.get("online"):
        return "Driver is offline"
    if profile.get("city_id") != booking["city_id"]:
        return "Driver does not serve this city"
    if profile.get("services") and booking["service_id"] not in profile["services"]:
        return "Driver has not opted for this service"
    today = now().date().isoformat()
    lic = profile.get("licence_expiry")
    if lic and lic < today:
        return "Driving licence has expired"
    if not any(d.get("doc_type") == "licence" and d.get("verified") for d in profile.get("documents", [])):
        return "Driving licence document not verified"
    if profile.get("docs_expired"):
        return "Expired documents: " + ", ".join(t.replace("_", " ") for t in profile["docs_expired"])
    for d in profile.get("documents", []):
        if d.get("doc_type") in ("identity", "police_verification") and d.get("expiry") and d["expiry"] < today:
            return f"{d['doc_type'].replace('_', ' ').title()} document has expired"
    if await driver_conflict(profile["user_id"], booking):
        return "Driver has a conflicting assignment"
    return None


async def broadcast_offers(booking: dict):
    """Offer a confirmed booking to every eligible online driver; first to accept wins."""
    count = 0
    t = now()
    async for p in db.driver_profiles.find({"status": "APPROVED", "online": True, "city_id": booking["city_id"]},
                                           {"_id": 0}):
        # Badge holders get the offer immediately; others after the priority window
        visible = t if p.get("badge") else t + timedelta(minutes=PRIORITY_MINUTES)
        expires = (visible + timedelta(minutes=OFFER_MINUTES)).isoformat()
        if await driver_eligibility(p, booking, require_online=True):
            continue
        exists = await db.booking_assignments.find_one({"booking_id": booking["id"], "driver_id": p["user_id"],
                                                       "status": "OFFERED"})
        if exists:
            continue
        await db.booking_assignments.insert_one({
            "id": new_id(), "booking_id": booking["id"], "driver_id": p["user_id"], "status": "OFFERED",
            "mode": "broadcast", "payout": booking.get("driver_payout", 0), "expires_at": expires,
            "visible_at": visible.isoformat(), "priority": bool(p.get("badge")), "created_at": now_iso(),
        })
        if p.get("badge"):
            await notify(p["user_id"], "Priority booking offer", f"{booking['service_name']} on {booking['date']} at {booking['time']}",
                     booking["id"])
        count += 1
    return count


async def confirm_booking(booking_id: str):
    """Called once the 20% advance is verified. Idempotent."""
    b = await db.bookings.find_one_and_update(
        {"id": booking_id, "status": {"$in": ["PAYMENT_PENDING", "QUOTED"]}},
        {"$set": {"status": "AWAITING_ASSIGNMENT", "confirmed_at": now_iso(),
                  "trip_otp": f"{secrets.randbelow(9000) + 1000}", "updated_at": now_iso()}},
        return_document=True, projection={"_id": 0})
    if not b:
        return
    await add_event(booking_id, "CONFIRMED", {"role": "system", "name": "Payment system"}, "20% advance received")
    await notify(b["customer_id"], "Booking confirmed", f"Your booking {b['ref']} is confirmed. We are assigning a driver.",
                 booking_id)
    await notify_admins("Booking confirmed", f"{b['ref']} needs a driver assignment", booking_id)
    await broadcast_offers(b)


async def expire_offers():
    await db.booking_assignments.update_many({"status": "OFFERED", "expires_at": {"$lt": now_iso()}},
                                             {"$set": {"status": "EXPIRED"}})
    # bookings stuck in ASSIGNED whose direct offer expired go back to the pool
    async for a in db.booking_assignments.find({"status": "EXPIRED", "mode": "direct", "handled": {"$ne": True}}, {"_id": 0}):
        await db.booking_assignments.update_one({"id": a["id"]}, {"$set": {"handled": True}})
        await db.bookings.update_one({"id": a["booking_id"], "status": "ASSIGNED", "driver_id": None},
                                     {"$set": {"status": "AWAITING_ASSIGNMENT", "offered_driver_id": None}})


async def recompute_payment_status(booking_id: str):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    paid = 0
    refunded = 0
    async for p in db.payments.find({"booking_id": booking_id}, {"_id": 0}):
        if p["status"] in ("paid", "refund_pending", "refunded", "partially_refunded"):
            paid += p["amount"]
        refunded += p.get("refunded_amount", 0)
    total = b.get("fare", {}).get("total") or 0
    advance = b.get("fare", {}).get("advance") or 0
    net = paid - refunded
    if refunded and net <= 0:
        st = "REFUNDED"
    elif total and net >= total:
        st = "PAID"
    elif net >= advance and advance:
        st = "ADVANCE_PAID"
    else:
        st = "PENDING"
    await db.bookings.update_one({"id": booking_id}, {"$set": {"amount_paid": net, "payment_status": st,
                                                             "balance_due": max(total - net, 0)}})
    return st
