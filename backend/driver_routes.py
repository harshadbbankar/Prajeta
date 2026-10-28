"""Driver app API: onboarding, documents, offers, trip workflow, earnings."""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from core import db, now, now_iso, new_id, require_driver, notify, notify_admins, put_object, APP_NAME, get_settings, clean, rupees
from logic import driver_eligibility, add_event, expire_offers, broadcast_offers, recompute_payment_status

DEFAULT_BONUS = {"top": 50, "gold": 100}  # rupees per completed trip (owner can change in ERP settings)
IST = timedelta(hours=5, minutes=30)
router = APIRouter(prefix="/api/driver")

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}
MAX_BYTES = 8 * 1024 * 1024


async def my_profile(user: dict) -> dict:
    p = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        p = {"id": new_id(), "user_id": user["id"], "name": user.get("name") or "", "phone": user.get("phone") or "",
             "address": "", "city_id": user.get("city_id") or "", "areas": [], "experience_years": 0,
             "licence_number": "", "licence_expiry": "", "vehicle_types": [], "transmissions": [], "services": [],
             "availability": "", "payout_upi": "", "payout_bank": "", "consent": False,
             "police_verification": "NOT_STARTED", "status": "DRAFT", "online": False, "documents": [],
             "created_at": now_iso()}
        await db.driver_profiles.insert_one(dict(p))
    return p


def public_profile(p: dict) -> dict:
    p = dict(p)
    p["documents"] = [{k: v for k, v in d.items() if k != "path"} | {"has_file": bool(d.get("path"))}
                      for d in p.get("documents", [])]
    return p


class ProfileIn(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city_id: Optional[str] = None
    areas: Optional[List[str]] = None
    experience_years: Optional[int] = None
    licence_number: Optional[str] = None
    licence_expiry: Optional[str] = None
    vehicle_types: Optional[List[str]] = None
    transmissions: Optional[List[str]] = None
    services: Optional[List[str]] = None
    availability: Optional[str] = None
    payout_upi: Optional[str] = None
    payout_bank: Optional[str] = None
    consent: Optional[bool] = None


@router.get("/profile")
async def get_profile(user: dict = Depends(require_driver)):
    return public_profile(await my_profile(user))


@router.put("/profile")
async def save_profile(body: ProfileIn, user: dict = Depends(require_driver)):
    p = await my_profile(user)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if p["status"] in ("APPROVED", "UNDER_REVIEW") and any(k in data for k in ("licence_number", "licence_expiry")):
        raise HTTPException(400, "Licence details can only be changed through support after submission")
    data["updated_at"] = now_iso()
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": data})
    if body.name:
        await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name}})
    return public_profile(await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0}))


@router.post("/submit")
async def submit(user: dict = Depends(require_driver)):
    p = await my_profile(user)
    if p["status"] not in ("DRAFT", "REJECTED"):
        raise HTTPException(400, "Application already submitted")
    if not user.get("phone"):
        raise HTTPException(400, "Add and verify your mobile number in Profile before submitting")
    missing = [f for f in ("name", "address", "city_id", "licence_number", "licence_expiry") if not p.get(f)]
    if missing:
        raise HTTPException(400, "Please complete: " + ", ".join(m.replace("_", " ") for m in missing))
    types = {d["doc_type"] for d in p.get("documents", [])}
    if not {"licence", "identity"} <= types:
        raise HTTPException(400, "Upload both your driving licence and an identity document")
    if not p.get("consent"):
        raise HTTPException(400, "Please accept the declarations and consent")
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {
        "status": "SUBMITTED", "submitted_at": now_iso(), "rejection_reason": None}})
    await notify_admins("New driver application", f"{p['name']} submitted documents for verification")
    return {"status": "SUBMITTED"}


@router.post("/documents")
async def upload_document(doc_type: str = Form(...), number: str = Form(""), expiry: str = Form(""),
                          file: UploadFile = File(...), user: dict = Depends(require_driver)):
    if doc_type not in ("licence", "identity", "address_proof", "police_verification", "photo", "licence_renewal"):
        raise HTTPException(400, "Unknown document type")
    if doc_type == "licence_renewal" and (not expiry or expiry < now_iso()[:10]):
        raise HTTPException(400, "Enter the renewed licence's future expiry date (YYYY-MM-DD)")
    if doc_type in ("identity", "police_verification", "address_proof") and expiry and expiry < now_iso()[:10]:
        raise HTTPException(400, "This document has already expired. Upload a currently valid copy.")
    ctype = (file.content_type or "").lower()
    if ctype not in ALLOWED_MIME:
        raise HTTPException(400, "Upload a JPG, PNG, WEBP or PDF file")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "File too large (max 8 MB)")
    p = await my_profile(user)
    ext = (file.filename or "file").rsplit(".", 1)[-1][:5] if "." in (file.filename or "") else "bin"
    did = new_id()
    path = f"{APP_NAME}/private/driver-docs/{user['id']}/{did}.{ext}"
    result = await run_in_threadpool(put_object, path, data, ctype)
    doc = {"id": did, "doc_type": doc_type, "number": number, "expiry": expiry or None, "verified": False,
           "path": result["path"], "name": file.filename, "content_type": ctype, "size": len(data),
           "uploaded_at": now_iso()}
    docs = [d for d in p.get("documents", []) if d["doc_type"] != doc_type] + [doc]
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {"documents": docs}})
    return {k: v for k, v in doc.items() if k != "path"}


class OnlineIn(BaseModel):
    online: bool


@router.post("/online")
async def set_online(body: OnlineIn, user: dict = Depends(require_driver)):
    p = await my_profile(user)
    if body.online and p["status"] != "APPROVED":
        raise HTTPException(400, "You can go online after your profile is approved")
    if body.online and (p.get("licence_expired") or (p.get("licence_expiry") and p["licence_expiry"] < now_iso()[:10])):
        raise HTTPException(400, "Your licence has expired. Upload your renewed licence to go online.")
    if body.online and p.get("docs_expired"):
        raise HTTPException(400, "Some documents have expired (" + ", ".join(t.replace("_", " ") for t in p["docs_expired"]) + "). Upload valid copies to go online.")
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {"online": body.online}})
    if not body.online:
        await db.booking_assignments.update_many({"driver_id": user["id"], "status": "OFFERED", "mode": "broadcast"},
                                                 {"$set": {"status": "WITHDRAWN"}})
    if body.online:
        async for b in db.bookings.find({"status": "AWAITING_ASSIGNMENT", "city_id": p["city_id"]}, {"_id": 0}):
            await broadcast_offers(b)
    return {"online": body.online}


async def booking_brief(b: dict, full: bool = False) -> dict:
    out = {k: b.get(k) for k in ("id", "ref", "service_id", "service_name", "city_id", "date", "time", "hours", "days",
                                 "status", "vehicle_type", "transmission", "notes", "driver_payout", "pickup_area",
                                 "destination", "started_at", "completed_at", "arrived_at", "balance_due")}
    out["pickup_area"] = b.get("pickup_area") or (b.get("pickup") or "").split(",")[-1].strip()
    if b.get("vehicle"):
        out["vehicle"] = {k: b["vehicle"].get(k) for k in ("make", "model", "reg_number", "body_type", "transmission", "color")}
    if full:
        out.update({"pickup": b.get("pickup"), "customer_name": b.get("customer_name"),
                    "customer_phone": b.get("customer_phone"), "fare_total": b.get("fare", {}).get("total"),
                    "payment_status": b.get("payment_status")})
    return out


@router.get("/offers")
async def offers(user: dict = Depends(require_driver)):
    await expire_offers()
    out = []
    t = now_iso()
    async for a in db.booking_assignments.find({"driver_id": user["id"], "status": "OFFERED",
                                                "$or": [{"visible_at": {"$exists": False}}, {"visible_at": {"$lte": t}}]},
                                               {"_id": 0}).sort("created_at", -1):
        b = await db.bookings.find_one({"id": a["booking_id"]}, {"_id": 0})
        if not b or b.get("driver_id") or b["status"] not in ("AWAITING_ASSIGNMENT", "ASSIGNED"):
            continue
        out.append({**a, "booking": await booking_brief(b)})
    return out


@router.post("/offers/{offer_id}/accept")
async def accept_offer(offer_id: str, user: dict = Depends(require_driver)):
    await expire_offers()
    a = await db.booking_assignments.find_one({"id": offer_id, "driver_id": user["id"]}, {"_id": 0})
    if not a or a["status"] != "OFFERED" or (a.get("visible_at") and a["visible_at"] > now_iso()):
        raise HTTPException(400, "This offer is no longer available")
    p = await my_profile(user)
    b = await db.bookings.find_one({"id": a["booking_id"]}, {"_id": 0})
    reason = await driver_eligibility(p, b)
    if reason:
        raise HTTPException(400, reason)
    # atomic claim: only one driver can win
    claimed = await db.bookings.find_one_and_update(
        {"id": b["id"], "driver_id": None, "status": {"$in": ["AWAITING_ASSIGNMENT", "ASSIGNED"]},
         "$or": [{"offered_driver_id": None}, {"offered_driver_id": user["id"]}, {"offered_driver_id": {"$exists": False}}]},
        {"$set": {"driver_id": user["id"], "driver_name": p["name"], "driver_phone": p["phone"],
                  "status": "ACCEPTED", "accepted_at": now_iso(), "updated_at": now_iso()}},
        projection={"_id": 0}, return_document=True)
    if not claimed:
        await db.booking_assignments.update_one({"id": offer_id}, {"$set": {"status": "WITHDRAWN"}})
        raise HTTPException(409, "Another driver already accepted this booking")
    await db.booking_assignments.update_one({"id": offer_id}, {"$set": {"status": "ACCEPTED", "responded_at": now_iso()}})
    await db.booking_assignments.update_many({"booking_id": b["id"], "status": "OFFERED"}, {"$set": {"status": "WITHDRAWN"}})
    await add_event(b["id"], "ACCEPTED", user)
    await notify(b["customer_id"], "Driver assigned", f"{p['name']} will drive for booking {b['ref']}.", b["id"])
    await notify_admins("Offer accepted", f"{p['name']} accepted {b['ref']}", b["id"])
    return await booking_brief(claimed, full=True)


@router.post("/offers/{offer_id}/decline")
async def decline_offer(offer_id: str, user: dict = Depends(require_driver)):
    a = await db.booking_assignments.find_one_and_update(
        {"id": offer_id, "driver_id": user["id"], "status": "OFFERED"},
        {"$set": {"status": "DECLINED", "responded_at": now_iso()}}, projection={"_id": 0})
    if not a:
        raise HTTPException(400, "This offer is no longer available")
    await add_event(a["booking_id"], "OFFER_DECLINED", user)
    if a.get("mode") == "direct":
        b = await db.bookings.find_one_and_update(
            {"id": a["booking_id"], "status": "ASSIGNED", "driver_id": None},
            {"$set": {"status": "AWAITING_ASSIGNMENT", "offered_driver_id": None}}, projection={"_id": 0},
            return_document=True)
        if b:
            await notify_admins("Offer declined", f"Driver declined {b['ref']}. Reassignment needed.", b["id"])
    return {"ok": True}


@router.get("/jobs")
async def jobs(user: dict = Depends(require_driver)):
    out = []
    async for b in db.bookings.find({"driver_id": user["id"]}, {"_id": 0}).sort([("date", -1), ("time", -1)]).limit(200):
        out.append(await booking_brief(b, full=b["status"] not in ("COMPLETED", "CANCELLED")))
    return out


async def my_job(booking_id: str, user: dict) -> dict:
    b = await db.bookings.find_one({"id": booking_id, "driver_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Job not found")
    return b


@router.get("/jobs/{booking_id}")
async def job_detail(booking_id: str, user: dict = Depends(require_driver)):
    b = await my_job(booking_id, user)
    events = [clean(e) async for e in db.trip_events.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1)]
    return {**(await booking_brief(b, full=True)), "events": events, "vehicle": b.get("vehicle"), "end_pin_required": bool(b.get("end_otp"))}


async def transition(booking_id: str, user: dict, frm: list, to: str, extra: dict = None, event: str = None):
    b = await db.bookings.find_one_and_update(
        {"id": booking_id, "driver_id": user["id"], "status": {"$in": frm}},
        {"$set": {"status": to, "updated_at": now_iso(), **(extra or {})}}, projection={"_id": 0}, return_document=True)
    if not b:
        raise HTTPException(400, "This action is not allowed in the current trip status")
    await add_event(booking_id, event or to, user)
    return b


@router.post("/jobs/{booking_id}/arrive")
async def arrive(booking_id: str, user: dict = Depends(require_driver)):
    b = await transition(booking_id, user, ["ACCEPTED"], "DRIVER_ARRIVED", {"arrived_at": now_iso()})
    await notify(b["customer_id"], "Driver arrived", f"Your driver has arrived. Share trip OTP to start {b['ref']}.", b["id"])
    return await booking_brief(b, full=True)


class OtpIn(BaseModel):
    otp: str


@router.post("/jobs/{booking_id}/start")
async def start(booking_id: str, body: OtpIn, user: dict = Depends(require_driver)):
    b = await my_job(booking_id, user)
    if b["status"] != "DRIVER_ARRIVED":
        raise HTTPException(400, "Mark arrival before starting the trip")
    if body.otp.strip() != b.get("trip_otp"):
        await add_event(booking_id, "OTP_FAILED", user)
        raise HTTPException(400, "Incorrect OTP. Ask the customer for the 4-digit trip OTP.")
    b = await transition(booking_id, user, ["DRIVER_ARRIVED"], "IN_PROGRESS", {"started_at": now_iso()}, "TRIP_STARTED")
    await notify(b["customer_id"], "Trip started", f"Your trip {b['ref']} is in progress.", b["id"])
    return await booking_brief(b, full=True)


class CompleteIn(BaseModel):
    cash_collected: bool = False
    end_pin: str = ""


@router.post("/jobs/{booking_id}/complete")
async def complete(booking_id: str, body: CompleteIn, user: dict = Depends(require_driver)):
    cur = await my_job(booking_id, user)
    if cur.get("end_otp") and body.end_pin.strip() != cur["end_otp"]:
        raise HTTPException(400, "Wrong handover PIN. Ask the customer for the trip-end PIN shown in their app.")
    b = await transition(booking_id, user, ["IN_PROGRESS"], "COMPLETED", {"completed_at": now_iso()}, "TRIP_COMPLETED")
    s = await get_settings()
    prof = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "badge": 1})
    badge = (prof or {}).get("badge")
    bonus = int(float(s.get(f"badge_bonus_{badge}", DEFAULT_BONUS.get(badge, 0)) or 0) * 100) if badge else 0
    if bonus > 0:
        await db.bookings.update_one({"id": booking_id}, {"$set": {"badge_bonus": bonus, "badge_at_completion": badge}})
        await notify(user["id"], "Badge bonus earned", f"+{rupees(bonus)} added to your payout for {b['ref']} — thanks for great service!", booking_id)
    res = await db.system_settings.find_one_and_update({"id": "main"}, {"$inc": {"invoice_counter": 1}},
                                                     return_document=True, projection={"_id": 0})
    await db.bookings.update_one({"id": booking_id}, {"$set": {"invoice_number": f"PRJ-INV-{res['invoice_counter']:05d}"}})
    if body.cash_collected and s.get("cash_enabled") and b.get("balance_due", 0) > 0:
        await db.payments.insert_one({"id": new_id(), "booking_id": booking_id, "customer_id": b["customer_id"],
                                      "kind": "balance", "amount": b["balance_due"], "currency": "INR",
                                      "method": "cash", "status": "paid", "collected_by": user["id"],
                                      "created_at": now_iso(), "paid_at": now_iso()})
        await recompute_payment_status(booking_id)
    await notify(b["customer_id"], "Trip completed", f"Thank you for riding with Prajeta. Please rate your driver for {b['ref']}.", b["id"])
    from wallet_routes import reward_referrer
    await reward_referrer(b)
    return await booking_brief(await db.bookings.find_one({"id": booking_id}, {"_id": 0}), full=True)


class EventIn(BaseModel):
    type: str
    note: str = ""


@router.post("/jobs/{booking_id}/event")
async def job_event(booking_id: str, body: EventIn, user: dict = Depends(require_driver)):
    b = await my_job(booking_id, user)
    if body.type not in ("DELAY", "CUSTOMER_NO_SHOW", "INCIDENT"):
        raise HTTPException(400, "Unknown event")
    await add_event(booking_id, body.type, user, body.note)
    if body.type == "CUSTOMER_NO_SHOW":
        await db.bookings.update_one({"id": booking_id}, {"$set": {"no_show_reported": "customer"}})
    if body.type in ("INCIDENT", "CUSTOMER_NO_SHOW"):
        await db.support_tickets.insert_one({
            "id": new_id(), "ref": "TKT-" + new_id()[:6].upper(), "user_id": user["id"], "user_role": "driver",
            "user_name": user.get("name"), "booking_id": booking_id, "booking_ref": b["ref"],
            "category": "incident" if body.type == "INCIDENT" else "no_show", "priority": "high",
            "subject": f"{body.type.replace('_', ' ').title()} on {b['ref']}", "status": "open",
            "messages": [{"by": "driver", "name": user.get("name"), "text": body.note or body.type, "internal": False,
                          "at": now_iso()}], "created_at": now_iso(), "updated_at": now_iso()})
        await notify_admins("Trip issue reported", f"{body.type} on {b['ref']}", booking_id)
    else:
        await notify(b["customer_id"], "Driver running late", body.note or "Your driver is slightly delayed.", booking_id)
    return {"ok": True}


@router.get("/earnings")
async def earnings(user: dict = Depends(require_driver)):
    """Wallet: totals, today/week/month, 14-day daily chart, per-trip history (base + adjustment + badge bonus), payouts."""
    today = (now() + IST).date()
    week_start = today - timedelta(days=today.weekday())
    items, total, bonus_total = [], 0, 0
    daily = {(today - timedelta(days=i)).isoformat(): {"amount": 0, "trips": 0} for i in range(13, -1, -1)}
    periods = {"today": 0, "week": 0, "month": 0}
    async for b in db.bookings.find({"driver_id": user["id"], "status": "COMPLETED"}, {"_id": 0}).sort("completed_at", -1):
        base, adj, bonus = b.get("driver_payout", 0), b.get("driver_adjustment", 0), b.get("badge_bonus", 0)
        amt = base + adj + bonus
        total += amt
        bonus_total += bonus
        ca = b.get("completed_at")
        day = (datetime.fromisoformat(ca) + IST).date().isoformat() if ca else b["date"]
        if day in daily:
            daily[day]["amount"] += amt
            daily[day]["trips"] += 1
        if day == today.isoformat():
            periods["today"] += amt
        if day >= week_start.isoformat():
            periods["week"] += amt
        if day[:7] == today.isoformat()[:7]:
            periods["month"] += amt
        items.append({"booking_id": b["id"], "ref": b["ref"], "service_name": b["service_name"], "date": b["date"],
                      "completed_at": b.get("completed_at"), "amount": amt, "base": base, "adjustment": adj,
                      "bonus": bonus, "badge": b.get("badge_at_completion")})
    payouts = [clean(p) async for p in db.driver_payouts.find({"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1)]
    paid = sum(p["amount"] for p in payouts if p["status"] == "PAID")
    s = await get_settings()
    prof = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "badge": 1, "payout_upi": 1, "payout_bank": 1})
    badge = (prof or {}).get("badge")
    return {"total_earned": total, "total_paid": paid, "pending": max(total - paid, 0), "items": items, "payouts": payouts,
            "bonus_total": bonus_total, "periods": periods,
            "daily": [{"date": k, **v} for k, v in daily.items()],
            "badge": badge,
            "bonus_rates": {k: int(float(s.get(f"badge_bonus_{k}", DEFAULT_BONUS[k]) or 0) * 100) for k in ("top", "gold")},
            "payout_method": (prof or {}).get("payout_upi") or (prof or {}).get("payout_bank") or None}