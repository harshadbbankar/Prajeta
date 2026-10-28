"""SOS safety alerts raised by the customer or driver during a live trip."""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from core import db, now_iso, new_id, notify, get_current_user, require_roles, logger
from logic import add_event, notify_due_offers

router = APIRouter(prefix="/api")
SOS_STATUSES = ("ACCEPTED", "DRIVER_ARRIVED", "IN_PROGRESS")
SOS_ROLES = ("owner", "super_admin", "ops", "support")


class SosIn(BaseModel):
    note: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None


@router.post("/bookings/{booking_id}/sos")
async def raise_sos(booking_id: str, body: SosIn, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    if user["role"] == "customer" and b["customer_id"] == user["id"]:
        side = "customer"
    elif user["role"] == "driver" and b.get("driver_id") == user["id"]:
        side = "driver"
    else:
        raise HTTPException(403, "Only the customer or driver of this trip can raise SOS")
    if b["status"] not in SOS_STATUSES:
        raise HTTPException(400, "SOS is available during live trips. For emergencies call 112.")
    open_alert = await db.sos_alerts.find_one({"booking_id": booking_id, "raised_by_role": side,
                                               "status": {"$in": ["OPEN", "ACKNOWLEDGED"]}}, {"_id": 0})
    if open_alert:
        return {**open_alert, "duplicate": True}
    loc = None
    if body.lat is not None and body.lng is not None and -90 <= body.lat <= 90 and -180 <= body.lng <= 180:
        loc = {"lat": body.lat, "lng": body.lng, "source": "device", "at": now_iso()}
    elif b.get("driver_location"):
        loc = {**{k: b["driver_location"][k] for k in ("lat", "lng", "at")}, "source": "driver_last_known"}
    alert = {"id": new_id(), "booking_id": booking_id, "ref": b["ref"], "city_id": b["city_id"],
             "raised_by_role": side, "raised_by_id": user["id"], "raised_by_name": user.get("name"),
             "raised_by_phone": user.get("phone"), "customer_name": b.get("customer_name"),
             "customer_phone": b.get("customer_phone"), "driver_id": b.get("driver_id"), "driver_name": b.get("driver_name"), "driver_phone": b.get("driver_phone"),
             "trip_status": b["status"], "note": body.note.strip()[:300], "location": loc,
             "status": "OPEN", "active": True, "created_at": now_iso(), "timeline": [{"at": now_iso(), "event": "RAISED", "by": user.get("name")}]}
    try:
        await db.sos_alerts.insert_one(dict(alert))
    except DuplicateKeyError:  # concurrent double-tap — return the alert that won
        existing = await db.sos_alerts.find_one({"booking_id": booking_id, "raised_by_role": side, "active": True}, {"_id": 0})
        return {**(existing or alert), "duplicate": True}
    await db.bookings.update_one({"id": booking_id}, {"$set": {"sos_active": True}})
    await add_event(booking_id, "SOS_RAISED", user, body.note.strip()[:300] or f"SOS raised by {side}")
    title = f"🚨 SOS · {b['ref']}"
    msg = f"{side.title()} {user.get('name') or ''} raised SOS during the trip. Call now."
    async for a in db.users.find({"role": {"$in": list(SOS_ROLES)}}, {"_id": 0, "id": 1}):
        await notify(a["id"], title, msg, booking_id)
    other = b.get("driver_id") if side == "customer" else b["customer_id"]
    if side == "driver":  # tell the customer their driver asked for help; don't alert the driver if customer raised it
        await notify(other, "Safety alert raised", "Your driver contacted Prajeta safety. Our team is calling now.", booking_id)
    logger.warning("SOS raised on %s by %s", b["ref"], side)
    return alert


@router.get("/bookings/{booking_id}/sos")
async def my_sos(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "customer_id": 1, "driver_id": 1})
    if not b or user["id"] not in (b["customer_id"], b.get("driver_id")):
        raise HTTPException(404, "Booking not found")
    a = await db.sos_alerts.find_one({"booking_id": booking_id, "raised_by_id": user["id"]}, {"_id": 0},
                                     sort=[("created_at", -1)])
    return {"alert": a}


@router.get("/admin/sos")
async def list_sos(status: str = "active", user: dict = Depends(require_roles(*SOS_ROLES))):
    q = {"status": {"$in": ["OPEN", "ACKNOWLEDGED"]}} if status == "active" else {} if status == "all" else {"status": status.upper()}
    items = [a async for a in db.sos_alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(100)]
    return {"items": items, "open": await db.sos_alerts.count_documents({"status": "OPEN"}),
            "active": await db.sos_alerts.count_documents({"status": {"$in": ["OPEN", "ACKNOWLEDGED"]}})}


class SosAction(BaseModel):
    action: str  # acknowledge | resolve
    note: str = ""


@router.post("/admin/sos/{alert_id}")
async def act_sos(alert_id: str, body: SosAction, user: dict = Depends(require_roles(*SOS_ROLES))):
    a = await db.sos_alerts.find_one({"id": alert_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Alert not found")
    if body.action == "acknowledge":
        if a["status"] != "OPEN":
            raise HTTPException(400, "Alert is already being handled")
        upd = {"status": "ACKNOWLEDGED", "acknowledged_by": user.get("name"), "acknowledged_at": now_iso()}
        party = a["raised_by_id"]
        await notify(party, "Help is on the way", f"{user.get('name') or 'Prajeta safety'} is handling your SOS and will call you.", a["booking_id"])
    elif body.action == "resolve":
        if a["status"] == "RESOLVED":
            raise HTTPException(400, "Alert is already resolved")
        if not body.note.strip():
            raise HTTPException(400, "Add a short note on how it was resolved")
        upd = {"status": "RESOLVED", "active": False, "resolved_by": user.get("name"), "resolved_at": now_iso(), "resolution": body.note.strip()[:500]}
    else:
        raise HTTPException(400, "Unknown action")
    await db.sos_alerts.update_one({"id": alert_id}, {"$set": upd, "$push": {"timeline": {
        "at": now_iso(), "event": upd["status"], "by": user.get("name"), "note": body.note.strip()[:500]}}})
    if upd["status"] == "RESOLVED" and not await db.sos_alerts.find_one(
            {"booking_id": a["booking_id"], "status": {"$in": ["OPEN", "ACKNOWLEDGED"]}}):
        await db.bookings.update_one({"id": a["booking_id"]}, {"$set": {"sos_active": False}})
    await add_event(a["booking_id"], f"SOS_{upd['status']}", user, body.note.strip()[:300])
    return {**a, **upd}


async def offer_wave_loop():
    # one active alert per booking + side (atomic duplicate protection)
    await db.sos_alerts.update_many({"status": "RESOLVED", "active": {"$exists": False}}, {"$set": {"active": False}})
    await db.sos_alerts.update_many({"status": {"$ne": "RESOLVED"}, "active": {"$exists": False}}, {"$set": {"active": True}})
    try:
        await db.sos_alerts.create_index([("booking_id", 1), ("raised_by_role", 1)], unique=True,
                                         partialFilterExpression={"active": True}, name="one_active_sos")
    except Exception as e:
        logger.error("sos index failed: %s", e)
    while True:
        try:
            await notify_due_offers()
        except Exception as e:
            logger.error("offer wave notify failed: %s", e)
        await asyncio.sleep(30)
