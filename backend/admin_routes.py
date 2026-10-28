"""ERP / Admin and Business Owner Intelligence API."""
import csv
import io
from collections import defaultdict
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core import db, now_iso, new_id, require_roles, audit, notify, period_range, get_settings, clean
from logic import (driver_eligibility, add_event, broadcast_offers, recompute_payment_status, apply_quote,
                   expire_offers, OFFER_MINUTES, ACTIVE_DRIVER_STATUSES)

router = APIRouter(prefix="/api/admin")

ANY_STAFF = require_roles("owner", "super_admin", "ops", "verification", "support", "finance")
OPS = require_roles("owner", "super_admin", "ops")
VERIFY = require_roles("owner", "super_admin", "ops", "verification")
SUPPORT = require_roles("owner", "super_admin", "ops", "support")
FINANCE = require_roles("owner", "super_admin", "finance")
OWNER = require_roles("owner", "super_admin", "finance")
SUPER = require_roles("owner", "super_admin")


async def period_bookings(period: str, city_id: str = "", service_id: str = "", start=None, end=None, prev=False):
    s, e, ps, pe = period_range(period, start, end)
    if prev:
        s, e = ps, pe
    q = {"created_at": {"$gte": s.isoformat(), "$lt": e.isoformat()}}
    if city_id:
        q["city_id"] = city_id
    if service_id:
        q["service_id"] = service_id
    return [b async for b in db.bookings.find(q, {"_id": 0})], s, e


async def metrics(bookings: list, s, e, settings: dict) -> dict:
    ids = {b["id"] for b in bookings}
    completed = [b for b in bookings if b["status"] == "COMPLETED"]
    cancelled = [b for b in bookings if b["status"] == "CANCELLED"]
    active = [b for b in bookings if b["status"] not in ("COMPLETED", "CANCELLED")]
    gbv = sum(b.get("fare", {}).get("total", 0) for b in bookings if b["status"] != "CANCELLED")
    revenue = sum(b["fare"].get("subtotal", 0) - b["fare"].get("discount", 0) for b in completed)
    payouts = sum(b.get("driver_payout", 0) + b.get("driver_adjustment", 0) + b.get("badge_bonus", 0) for b in completed)
    pays = [p async for p in db.payments.find({"booking_id": {"$in": list(ids)}, "status": {"$in": ["paid", "refunded", "partially_refunded", "refund_pending"]}}, {"_id": 0})]
    refunds = sum(p.get("refunded_amount", 0) for p in pays)
    collections = sum(p["amount"] for p in pays) - refunds
    online = sum(p["amount"] for p in pays if p["method"] == "razorpay")
    gateway_fees = int(online * settings.get("gateway_fee_percent", 2) / 100)
    receivables = sum(b.get("balance_due", 0) for b in completed)
    expenses = [x async for x in db.expenses.find({"date": {"$gte": s.date().isoformat(), "$lt": e.date().isoformat()}}, {"_id": 0})]
    opex = sum(x["amount"] for x in expenses)
    contribution = revenue - payouts - gateway_fees - refunds
    cust_counts = defaultdict(int)
    for b in bookings:
        cust_counts[b["customer_id"]] += 1
    n_c = len(cust_counts) or 1
    total = len(bookings) or 1
    return {
        "bookings": len(bookings), "completed": len(completed), "cancelled": len(cancelled), "active": len(active),
        "completion_rate": round(len(completed) * 100 / total, 1), "cancellation_rate": round(len(cancelled) * 100 / total, 1),
        "gbv": gbv, "revenue": revenue, "collections": collections, "receivables": receivables, "payouts": payouts,
        "gateway_fees": gateway_fees, "refunds": refunds, "contribution": contribution,
        "contribution_margin": round(contribution * 100 / revenue, 1) if revenue else 0,
        "opex": opex, "operating_profit": contribution - opex,
        "avg_booking_value": int(gbv / max(len(bookings) - len(cancelled), 1)),
        "revenue_per_booking": int(revenue / len(completed)) if completed else 0,
        "contribution_per_booking": int(contribution / len(completed)) if completed else 0,
        "customers": len(cust_counts), "repeat_rate": round(sum(1 for v in cust_counts.values() if v > 1) * 100 / n_c, 1),
        "expenses_by_category": _group(expenses, "category"),
    }


def _group(items, key):
    out = defaultdict(int)
    for x in items:
        out[x[key]] += x["amount"]
    return dict(out)


# ------------------------------------------------------------------ dashboard
@router.get("/dashboard")
async def dashboard(period: str = "30d", city_id: str = "", service_id: str = "", start: Optional[str] = None,
                    end: Optional[str] = None, user: dict = Depends(ANY_STAFF)):
    await expire_offers()
    settings = await get_settings()
    bookings, s, e = await period_bookings(period, city_id, service_id, start, end)
    m = await metrics(bookings, s, e, settings)
    dq = {"status": "APPROVED"}
    if city_id:
        dq["city_id"] = city_id
    drivers_total = await db.driver_profiles.count_documents({"city_id": city_id} if city_id else {})
    pending_ver = await db.driver_profiles.count_documents({**({"city_id": city_id} if city_id else {}),
                                                            "status": {"$in": ["SUBMITTED", "UNDER_REVIEW"]}})
    approved = await db.driver_profiles.count_documents(dq)
    available = await db.driver_profiles.count_documents({**dq, "online": True})
    trend = defaultdict(lambda: {"bookings": 0, "gbv": 0})
    for b in bookings:
        d = b["created_at"][:10]
        trend[d]["bookings"] += 1
        if b["status"] != "CANCELLED":
            trend[d]["gbv"] += b.get("fare", {}).get("total", 0)
    statuses = defaultdict(int)
    for b in bookings:
        statuses[b["status"]] += 1
    return {
        **m, "new_bookings": len(bookings),
        "pending_assignment": await db.bookings.count_documents({"status": {"$in": ["AWAITING_ASSIGNMENT", "ASSIGNED"]}}),
        "quotes_pending": await db.bookings.count_documents({"status": "QUOTE_REQUESTED"}),
        "active_trips": await db.bookings.count_documents({"status": {"$in": ["DRIVER_ARRIVED", "IN_PROGRESS"]}}),
        "confirmed": await db.bookings.count_documents({"status": {"$in": ["AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED"]}}),
        "pending_payments": await db.bookings.count_documents({"status": "PAYMENT_PENDING"}),
        "drivers_registered": drivers_total, "drivers_pending": pending_ver, "drivers_approved": approved,
        "drivers_available": available,
        "customers_total": await db.users.count_documents({"role": "customer"}),
        "open_tickets": await db.support_tickets.count_documents({"status": {"$ne": "resolved"}}),
        "new_enquiries": await db.corporate_enquiries.count_documents({"status": "NEW"}),
        "licences_expired": await db.driver_profiles.count_documents({"licence_expired": True}),
        "trend": [{"date": k, **v} for k, v in sorted(trend.items())], "status_breakdown": dict(statuses),
        "period_start": s.isoformat(), "period_end": e.isoformat(),
    }


# ------------------------------------------------------------------ drivers
@router.get("/drivers")
async def drivers(status: str = "", q: str = "", city_id: str = "", user: dict = Depends(VERIFY)):
    query = {}
    if status:
        query["status"] = status
    if city_id:
        query["city_id"] = city_id
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q}}]
    out = []
    async for p in db.driver_profiles.find(query, {"_id": 0}).sort("created_at", -1).limit(300):
        p["documents"] = [{k: v for k, v in d.items() if k != "path"} | {"has_file": bool(d.get("path"))} for d in p.get("documents", [])]
        p.pop("payout_bank", None)
        out.append(p)
    return out


@router.get("/drivers/{user_id}")
async def driver_detail(user_id: str, user: dict = Depends(VERIFY)):
    p = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Driver not found")
    p["documents"] = [{k: v for k, v in d.items() if k != "path"} | {"has_file": bool(d.get("path"))} for d in p.get("documents", [])]
    jobs = [{k: b.get(k) for k in ("id", "ref", "service_name", "date", "status", "driver_payout", "driver_adjustment", "badge_bonus")}
            async for b in db.bookings.find({"driver_id": user_id}, {"_id": 0}).sort("date", -1).limit(50)]
    offers = defaultdict(int)
    async for a in db.booking_assignments.find({"driver_id": user_id}, {"_id": 0, "status": 1}):
        offers[a["status"]] += 1
    reviews = [clean(r) async for r in db.reviews.find({"driver_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(20)]
    payouts = [clean(x) async for x in db.driver_payouts.find({"driver_id": user_id}, {"_id": 0})]
    earned = sum((b.get("driver_payout") or 0) + (b.get("driver_adjustment") or 0) + (b.get("badge_bonus") or 0)
                 for b in jobs if b["status"] == "COMPLETED")
    complaints = await db.support_tickets.count_documents({"booking_id": {"$in": [j["id"] for j in jobs]}, "category": {"$in": ["incident", "complaint"]}})
    return {**p, "jobs": jobs, "offer_stats": dict(offers), "reviews": reviews, "payouts": payouts, "earned": earned,
            "paid": sum(x["amount"] for x in payouts), "complaints": complaints}


class DriverStatusIn(BaseModel):
    status: str
    reason: str = ""


@router.post("/drivers/{user_id}/status")
async def driver_status(user_id: str, body: DriverStatusIn, user: dict = Depends(VERIFY)):
    if body.status not in ("UNDER_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"):
        raise HTTPException(400, "Invalid status")
    p = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Driver not found")
    if body.status == "APPROVED":
        if not any(d["doc_type"] == "licence" and d.get("verified") for d in p.get("documents", [])):
            raise HTTPException(400, "Verify the driving licence document before approving")
        if p.get("licence_expiry") and p["licence_expiry"] < now_iso()[:10]:
            raise HTTPException(400, "Licence has expired")
    if body.status in ("REJECTED", "SUSPENDED") and not body.reason.strip():
        raise HTTPException(400, "Please record a reason")
    upd = {"status": body.status, "status_reason": body.reason, "reviewed_by": user["id"], "reviewed_at": now_iso()}
    if body.status == "REJECTED":
        upd["rejection_reason"] = body.reason
    if body.status in ("REJECTED", "SUSPENDED"):
        upd["online"] = False
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": upd})
    await audit(user, f"driver_{body.status.lower()}", "driver", user_id, {"from": p["status"], "reason": body.reason})
    await notify(user_id, "Verification update", {
        "APPROVED": "Congratulations! Your profile is approved. Go online to receive jobs.",
        "REJECTED": f"Your application was not approved: {body.reason}",
        "SUSPENDED": f"Your account is suspended: {body.reason}",
        "UNDER_REVIEW": "Your documents are under review."}[body.status])
    return {"ok": True}


class DocIn(BaseModel):
    verified: bool
    expiry: Optional[str] = None
    police_verification: Optional[str] = None


@router.post("/drivers/{user_id}/documents/{doc_id}")
async def verify_doc(user_id: str, doc_id: str, body: DocIn, user: dict = Depends(VERIFY)):
    p = await db.driver_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Driver not found")
    docs = p.get("documents", [])
    target = next((d for d in docs if d["id"] == doc_id), None)
    if not target:
        raise HTTPException(404, "Document not found")
    upd = {}
    if target["doc_type"] == "licence_renewal" and not body.verified:
        docs = [d for d in docs if d["id"] != doc_id]
        await notify(user_id, "Licence renewal not accepted", "Please upload a clear copy of your renewed licence with the correct expiry date.")
    elif target["doc_type"] == "licence_renewal" and body.verified:
        expiry = body.expiry or target.get("expiry")
        if not expiry or expiry < now_iso()[:10]:
            raise HTTPException(400, "Enter the renewed licence's valid future expiry date")
        renewed = {**target, "doc_type": "licence", "verified": True, "verified_by": user["id"], "expiry": expiry}
        docs = [d for d in docs if d["doc_type"] not in ("licence", "licence_renewal")] + [renewed]
        upd.update({"licence_expiry": expiry, "licence_expired": False, "licence_reminders_sent": []})
        await notify(user_id, "Licence renewed", "Your renewed licence is verified. You can go online again.")
    else:
        for d in docs:
            if d["id"] == doc_id:
                d["verified"] = body.verified
                d["verified_by"] = user["id"]
                if body.expiry:
                    d["expiry"] = body.expiry
        if target["doc_type"] == "licence" and body.expiry:
            upd.update({"licence_expiry": body.expiry, "licence_expired": body.expiry < now_iso()[:10],
                        "licence_reminders_sent": []})
    upd["documents"] = docs
    exp = target.get("expiry") if not body.expiry else body.expiry
    if target["doc_type"] in ("identity", "police_verification") and body.verified and (not exp or exp >= now_iso()[:10]):
        remaining = [t for t in p.get("docs_expired", []) if t != target["doc_type"]]
        upd["docs_expired"] = remaining
        if target["doc_type"] in p.get("docs_expired", []):
            await notify(user_id, "Document verified", "Your renewed document is verified. You can go online again." if not remaining else "Document verified.")
    if body.police_verification:
        upd["police_verification"] = body.police_verification
    if p["status"] == "SUBMITTED":
        upd["status"] = "UNDER_REVIEW"
    await db.driver_profiles.update_one({"user_id": user_id}, {"$set": upd})
    await audit(user, "document_verified" if body.verified else "document_unverified", "driver_document", doc_id)
    return {"ok": True}


# ------------------------------------------------------------------ customers
@router.get("/customers")
async def customers(q: str = "", user: dict = Depends(SUPPORT)):
    query = {"role": {"$in": ["customer", "corporate"]}}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"phone": {"$regex": q}}]
    out = []
    async for u in db.users.find(query, {"_id": 0}).sort("created_at", -1).limit(300):
        u["bookings"] = await db.bookings.count_documents({"customer_id": u["id"]})
        out.append(u)
    return out


@router.get("/customers/{uid}")
async def customer_detail(uid: str, user: dict = Depends(SUPPORT)):
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(404, "Customer not found")
    bookings = [{k: b.get(k) for k in ("id", "ref", "service_name", "date", "status", "payment_status")}
                async for b in db.bookings.find({"customer_id": uid}, {"_id": 0}).sort("created_at", -1)]
    tickets = [{k: t.get(k) for k in ("id", "ref", "subject", "status")} async for t in db.support_tickets.find({"user_id": uid}, {"_id": 0})]
    return {**u, "booking_list": bookings, "tickets": tickets}


class RestrictIn(BaseModel):
    restricted: bool
    reason: str = ""


@router.post("/customers/{uid}/restrict")
async def restrict(uid: str, body: RestrictIn, user: dict = Depends(OPS)):
    await db.users.update_one({"id": uid, "role": {"$in": ["customer", "corporate", "driver"]}},
                              {"$set": {"restricted": body.restricted, "restricted_reason": body.reason}})
    await audit(user, "account_restricted" if body.restricted else "account_unrestricted", "user", uid, body.reason)
    return {"ok": True}


# ------------------------------------------------------------------ bookings & dispatch
@router.get("/bookings")
async def bookings(status: str = "", q: str = "", city_id: str = "", service_id: str = "", payment_status: str = "",
                   date: str = "", user: dict = Depends(SUPPORT)):
    await expire_offers()
    query = {}
    if status:
        query["status"] = {"$in": status.split(",")}
    for k, v in (("city_id", city_id), ("service_id", service_id), ("payment_status", payment_status), ("date", date)):
        if v:
            query[k] = v
    if q:
        query["$or"] = [{"ref": {"$regex": q, "$options": "i"}}, {"customer_name": {"$regex": q, "$options": "i"}},
                        {"customer_phone": {"$regex": q}}, {"driver_name": {"$regex": q, "$options": "i"}}]
    return [b async for b in db.bookings.find(query, {"_id": 0, "trip_otp": 0, "end_otp": 0}).sort("created_at", -1).limit(300)]


@router.get("/bookings/export.csv")
async def export_bookings(user: dict = Depends(OWNER)):
    buf = io.StringIO()
    w = csv.writer(buf)
    cols = ["ref", "created_at", "service_name", "city_id", "date", "time", "status", "payment_status", "customer_name",
            "driver_name", "total", "amount_paid", "balance_due", "driver_payout"]
    w.writerow(cols)
    async for b in db.bookings.find({}, {"_id": 0}).sort("created_at", -1):
        w.writerow([b.get(c) if c != "total" else b.get("fare", {}).get("total", 0) for c in cols])
    await audit(user, "export_bookings", "report", "bookings")
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=prajeta-bookings.csv"})


@router.get("/bookings/{bid}")
async def booking_detail(bid: str, user: dict = Depends(SUPPORT)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0, "trip_otp": 0, "end_otp": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    events = [clean(e) async for e in db.trip_events.find({"booking_id": bid}, {"_id": 0}).sort("created_at", 1)]
    offers = []
    async for a in db.booking_assignments.find({"booking_id": bid}, {"_id": 0}).sort("created_at", -1):
        dp = await db.driver_profiles.find_one({"user_id": a["driver_id"]}, {"_id": 0, "name": 1})
        offers.append({**a, "driver_name": (dp or {}).get("name")})
    payments = [clean(p) async for p in db.payments.find({"booking_id": bid}, {"_id": 0})]
    eligible = []
    if b["status"] in ("AWAITING_ASSIGNMENT", "ASSIGNED"):
        from tracking_routes import geocode, haversine_km, ROAD_FACTOR
        pickup = await geocode(b.get("pickup", ""), b["city_id"], b.get("city_name", ""))
        async for p in db.driver_profiles.find({"status": "APPROVED", "city_id": b["city_id"]}, {"_id": 0}):
            reason = await driver_eligibility(p, b)
            loc = p.get("last_location")
            km = round(haversine_km((loc["lat"], loc["lng"]), (pickup["lat"], pickup["lng"])) * ROAD_FACTOR, 1) if loc and pickup else None
            eligible.append({"user_id": p["user_id"], "name": p["name"], "online": p.get("online"),
                             "rating": p.get("rating"), "experience_years": p.get("experience_years"),
                             "badge": p.get("badge"), "distance_km": km,
                             "eligible": reason is None, "reason": reason})
        eligible.sort(key=lambda d: (not d["eligible"], d["distance_km"] is None, d["distance_km"] or 0, not d["badge"]))
    return {**b, "events": events, "offers": offers, "payments": payments, "eligible_drivers": eligible}


class AssignIn(BaseModel):
    driver_id: str


@router.post("/bookings/{bid}/assign")
async def assign(bid: str, body: AssignIn, user: dict = Depends(OPS)):
    from datetime import timedelta
    from core import now
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or b["status"] not in ("AWAITING_ASSIGNMENT", "ASSIGNED", "ACCEPTED"):
        raise HTTPException(400, "Booking cannot be assigned in its current status")
    p = await db.driver_profiles.find_one({"user_id": body.driver_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Driver not found")
    reason = await driver_eligibility(p, b)
    if reason:
        raise HTTPException(400, reason)
    prev_driver = b.get("driver_id")
    await db.booking_assignments.update_many({"booking_id": bid, "status": {"$in": ["OFFERED", "ACCEPTED"]}},
                                             {"$set": {"status": "WITHDRAWN"}})
    await db.booking_assignments.insert_one({"id": new_id(), "booking_id": bid, "driver_id": body.driver_id,
                                             "status": "OFFERED", "mode": "direct", "payout": b.get("driver_payout", 0),
                                             "expires_at": (now() + timedelta(minutes=OFFER_MINUTES)).isoformat(),
                                             "assigned_by": user["id"], "created_at": now_iso()})
    await db.bookings.update_one({"id": bid}, {"$set": {"status": "ASSIGNED", "driver_id": None, "driver_name": None,
                                                       "offered_driver_id": body.driver_id, "updated_at": now_iso()}})
    await add_event(bid, "REASSIGNED" if prev_driver else "ASSIGNED", user, f"Offered to {p['name']}")
    await audit(user, "booking_assign", "booking", bid, {"driver": body.driver_id, "previous": prev_driver})
    await notify(body.driver_id, "Booking assigned to you", f"{b['service_name']} on {b['date']} {b['time']}. Please accept.", bid)
    if prev_driver:
        await notify(prev_driver, "Assignment changed", f"{b['ref']} has been reassigned.", bid)
    return {"ok": True}


class StatusIn(BaseModel):
    status: str
    reason: str = ""


@router.post("/bookings/{bid}/status")
async def set_status(bid: str, body: StatusIn, user: dict = Depends(OPS)):
    allowed = {"CANCELLED", "NO_SHOW_CUSTOMER", "NO_SHOW_DRIVER", "COMPLETED", "AWAITING_ASSIGNMENT", "ESCALATED"}
    if body.status not in allowed:
        raise HTTPException(400, "Status not permitted")
    if body.status in ("CANCELLED", "NO_SHOW_CUSTOMER", "NO_SHOW_DRIVER", "ESCALATED") and not body.reason.strip():
        raise HTTPException(400, "Please record a reason")
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    upd = {"updated_at": now_iso()}
    if body.status == "ESCALATED":
        upd["escalated"] = True
        upd["escalation_reason"] = body.reason
    elif body.status == "NO_SHOW_DRIVER":
        upd.update({"status": "AWAITING_ASSIGNMENT", "driver_id": None, "driver_name": None, "offered_driver_id": None})
    elif body.status == "NO_SHOW_CUSTOMER":
        upd.update({"status": "CANCELLED", "cancel_reason": "Customer no-show: " + body.reason, "cancelled_by": "ops"})
    elif body.status == "CANCELLED":
        upd.update({"status": "CANCELLED", "cancel_reason": body.reason, "cancelled_by": "ops"})
    else:
        upd["status"] = body.status
    await db.bookings.update_one({"id": bid}, {"$set": upd})
    if upd.get("status") in ("CANCELLED", "AWAITING_ASSIGNMENT", "COMPLETED"):
        await db.booking_assignments.update_many({"booking_id": bid, "status": "OFFERED"}, {"$set": {"status": "WITHDRAWN"}})
    await add_event(bid, body.status, user, body.reason)
    await audit(user, "booking_status", "booking", bid, {"from": b["status"], "to": body.status, "reason": body.reason})
    if upd.get("status") == "COMPLETED":
        from wallet_routes import reward_referrer
        await reward_referrer(b)
    credit = (b.get("fare") or {}).get("credit_used") or 0
    if upd.get("status") == "CANCELLED" and credit and not b.get("amount_paid") and not b.get("credit_restored"):
        await db.users.update_one({"id": b["customer_id"]}, {"$inc": {"referral_credit": credit}})
        await db.bookings.update_one({"id": bid}, {"$set": {"credit_restored": True}})
    if body.status == "NO_SHOW_DRIVER":
        nb = await db.bookings.find_one({"id": bid}, {"_id": 0})
        await broadcast_offers(nb)
    await notify(b["customer_id"], "Booking update", f"{b['ref']}: {body.status.replace('_', ' ').title()}", bid)
    return {"ok": True}


class QuoteIn(BaseModel):
    amount: int  # paise, pre-tax
    note: str = ""


@router.post("/bookings/{bid}/quote")
async def quote(bid: str, body: QuoteIn, user: dict = Depends(OPS)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or b["status"] not in ("QUOTE_REQUESTED", "QUOTED"):
        raise HTTPException(400, "Booking is not awaiting a quote")
    if body.amount <= 0:
        raise HTTPException(400, "Enter a valid amount")
    s = await get_settings()
    fare = apply_quote(body.amount, s.get("tax_rate", 18), s.get("advance_percent", 20))
    await db.bookings.update_one({"id": bid}, {"$set": {
        "fare": fare, "status": "QUOTED", "quote_note": body.note, "balance_due": fare["total"],
        "driver_payout": int(body.amount * s.get("driver_share_percent", 70) / 100), "updated_at": now_iso()}})
    await add_event(bid, "QUOTED", user, body.note)
    await audit(user, "booking_quote", "booking", bid, {"amount": body.amount})
    await notify(b["customer_id"], "Your quote is ready", f"Pay the 20% advance to confirm {b['ref']}.", bid)
    return {"ok": True}


class AdjustIn(BaseModel):
    amount: int  # paise, may be negative (customer fare adjustment, pre-tax)
    driver_amount: int = 0
    reason: str


@router.post("/bookings/{bid}/adjust")
async def adjust(bid: str, body: AdjustIn, user: dict = Depends(require_roles("owner", "super_admin", "finance", "ops"))):
    if not body.reason.strip():
        raise HTTPException(400, "Please record a reason")
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or not b.get("fare"):
        raise HTTPException(400, "Booking has no fare")
    f = b["fare"]
    f["lines"] = f.get("lines", []) + [{"label": f"Adjustment: {body.reason}", "amount": body.amount}]
    f["subtotal"] += body.amount
    f["tax"] = int(round((f["subtotal"] - f.get("discount", 0)) * f.get("tax_rate", 18) / 100))
    f["total"] = f["subtotal"] - f.get("discount", 0) + f["tax"]
    await db.bookings.update_one({"id": bid}, {"$set": {"fare": f}, "$inc": {"driver_adjustment": body.driver_amount}})
    await recompute_payment_status(bid)
    await add_event(bid, "FARE_ADJUSTED", user, body.reason)
    await audit(user, "fare_adjustment", "booking", bid, body.model_dump())
    return {"ok": True}


class CashIn(BaseModel):
    amount: int
    reference: str = ""


@router.post("/bookings/{bid}/cash")
async def record_cash(bid: str, body: CashIn, user: dict = Depends(FINANCE)):
    b = await db.bookings.find_one({"id": bid}, {"_id": 0})
    if not b or body.amount <= 0:
        raise HTTPException(400, "Invalid payment")
    if b["status"] in ("CANCELLED", "QUOTE_REQUESTED") or not b.get("fare"):
        raise HTTPException(400, "Payments cannot be recorded for this booking status")
    kind = "advance" if b["status"] in ("PAYMENT_PENDING", "QUOTED") else "balance"
    await db.payments.insert_one({"id": new_id(), "booking_id": bid, "customer_id": b["customer_id"], "kind": kind,
                                  "amount": body.amount, "currency": "INR", "method": "cash", "status": "paid",
                                  "reference": body.reference, "recorded_by": user["id"], "created_at": now_iso(),
                                  "paid_at": now_iso()})
    await recompute_payment_status(bid)
    if kind == "advance" and body.amount >= b["fare"]["advance"]:
        from logic import confirm_booking
        await confirm_booking(bid)
    await audit(user, "cash_recorded", "booking", bid, body.model_dump())
    return {"ok": True}


# ------------------------------------------------------------------ tariffs, cities, settings
@router.get("/services")
async def services(user: dict = Depends(ANY_STAFF)):
    return [s async for s in db.service_categories.find({}, {"_id": 0}).sort("order", 1)]


class ServiceIn(BaseModel):
    base_fare: Optional[int] = None
    base_hours: Optional[float] = None
    extra_hour_rate: Optional[int] = None
    night_surcharge: Optional[int] = None
    per_day: Optional[int] = None
    waiting_per_hour: Optional[int] = None
    cancellation_fee: Optional[int] = None
    active: Optional[bool] = None
    effective_from: Optional[str] = None
    tagline: Optional[str] = None


@router.put("/services/{sid}")
async def update_service(sid: str, body: ServiceIn, user: dict = Depends(SUPER)):
    old = await db.service_categories.find_one({"id": sid}, {"_id": 0})
    if not old:
        raise HTTPException(404, "Service not found")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.service_categories.update_one({"id": sid}, {"$set": data, "$inc": {"tariff_version": 1}})
    await db.tariff_history.insert_one({"id": new_id(), "service_id": sid, "previous": old, "changes": data,
                                        "by": user["id"], "created_at": now_iso()})
    await audit(user, "tariff_update", "service", sid, data)
    return await db.service_categories.find_one({"id": sid}, {"_id": 0})


@router.get("/cities")
async def cities(user: dict = Depends(ANY_STAFF)):
    return [c async for c in db.service_areas.find({}, {"_id": 0}).sort("name", 1)]


class CityIn(BaseModel):
    enabled: Optional[bool] = None
    multiplier: Optional[float] = None
    areas: Optional[List[str]] = None


@router.put("/cities/{cid}")
async def update_city(cid: str, body: CityIn, user: dict = Depends(SUPER)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.service_areas.update_one({"id": cid}, {"$set": data})
    await audit(user, "city_update", "service_area", cid, data)
    return {"ok": True}


@router.get("/settings")
async def settings_get(user: dict = Depends(ANY_STAFF)):
    return await get_settings()


@router.put("/settings")
async def settings_put(body: dict, user: dict = Depends(SUPER)):
    allowed = {"company_name", "legal_name", "tagline", "support_phone", "support_email", "whatsapp_link",
               "business_hours", "address", "tax_rate", "advance_percent", "driver_share_percent", "gateway_fee_percent",
               "cash_enabled", "bookings_enabled", "badge_bonus_top", "badge_bonus_gold",
               "referral_friend_amount", "referral_referrer_amount"}
    data = {k: v for k, v in body.items() if k in allowed}
    for k in ("badge_bonus_top", "badge_bonus_gold", "referral_friend_amount", "referral_referrer_amount"):
        if k in data:
            if isinstance(data[k], bool) or data[k] in ("", None):
                raise HTTPException(400, "Bonus and referral amounts must be numbers")
            try:
                data[k] = float(data[k])
            except (TypeError, ValueError):
                raise HTTPException(400, "Bonus and referral amounts must be numbers")
            if not 0 <= data[k] <= 5000:
                raise HTTPException(400, "Bonus and referral amounts must be between ₹0 and ₹5,000")
    await db.system_settings.update_one({"id": "main"}, {"$set": data})
    await audit(user, "settings_update", "system_settings", "main", data)
    return await get_settings()


# ------------------------------------------------------------------ finance
@router.get("/payments")
async def payments(status: str = "", user: dict = Depends(FINANCE)):
    q = {"status": status} if status else {}
    out = []
    async for p in db.payments.find(q, {"_id": 0, "attempts": 0}).sort("created_at", -1).limit(300):
        b = await db.bookings.find_one({"id": p["booking_id"]}, {"_id": 0, "ref": 1, "customer_name": 1})
        out.append({**p, "booking_ref": (b or {}).get("ref"), "customer_name": (b or {}).get("customer_name")})
    return out


class RefundIn(BaseModel):
    amount: int
    reason: str


@router.post("/payments/{pid}/refund")
async def refund(pid: str, body: RefundIn, user: dict = Depends(require_roles("owner", "finance"))):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p or p["status"] not in ("paid", "partially_refunded"):
        raise HTTPException(400, "Only paid payments can be refunded")
    already = p.get("refunded_amount", 0)
    if body.amount <= 0 or body.amount + already > p["amount"] or not body.reason.strip():
        raise HTTPException(400, "Invalid refund amount or missing reason")
    gateway_ref = None
    status = "refunded"
    if p["method"] == "razorpay" and p.get("razorpay_payment_id"):
        from server import rzp_client
        from fastapi.concurrency import run_in_threadpool
        try:
            r = await run_in_threadpool(rzp_client().payment.refund, p["razorpay_payment_id"], {"amount": body.amount})
            gateway_ref = r.get("id")
            status = "refunded" if r.get("status") == "processed" else "refund_pending"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Gateway refund failed: {e}")
    total_ref = already + body.amount
    await db.payments.update_one({"id": pid}, {"$set": {
        "refunded_amount": total_ref, "status": status if total_ref >= p["amount"] else "partially_refunded"}})
    await db.refunds.insert_one({"id": new_id(), "payment_id": pid, "booking_id": p["booking_id"], "amount": body.amount,
                                 "reason": body.reason, "gateway_refund_id": gateway_ref, "status": status,
                                 "by": user["id"], "created_at": now_iso()})
    await recompute_payment_status(p["booking_id"])
    await audit(user, "refund", "payment", pid, body.model_dump())
    await notify(p["customer_id"], "Refund initiated", f"A refund of ₹{body.amount / 100:,.2f} has been initiated.", p["booking_id"])
    return {"ok": True, "status": status}


@router.get("/expenses")
async def expenses(user: dict = Depends(FINANCE)):
    cats = [c["name"] async for c in db.expense_categories.find({}, {"_id": 0})]
    items = [x async for x in db.expenses.find({}, {"_id": 0}).sort("date", -1).limit(300)]
    return {"categories": cats, "items": items}


class ExpenseIn(BaseModel):
    category: str
    amount: int
    date: str
    note: str = ""
    city_id: Optional[str] = None


@router.post("/expenses")
async def add_expense(body: ExpenseIn, user: dict = Depends(FINANCE)):
    if body.amount <= 0:
        raise HTTPException(400, "Enter a valid amount")
    doc = {"id": new_id(), **body.model_dump(), "by": user["id"], "created_at": now_iso()}
    await db.expenses.insert_one(dict(doc))
    await audit(user, "expense_added", "expense", doc["id"], body.model_dump())
    return clean(doc)


@router.get("/payouts")
async def payouts(user: dict = Depends(FINANCE)):
    out = []
    async for p in db.driver_profiles.find({"status": {"$in": ["APPROVED", "SUSPENDED"]}}, {"_id": 0}):
        earned = 0
        async for b in db.bookings.find({"driver_id": p["user_id"], "status": "COMPLETED"}, {"_id": 0, "driver_payout": 1, "driver_adjustment": 1, "badge_bonus": 1}):
            earned += b.get("driver_payout", 0) + b.get("driver_adjustment", 0) + b.get("badge_bonus", 0)
        paid = sum([x["amount"] async for x in db.driver_payouts.find({"driver_id": p["user_id"], "status": "PAID"}, {"_id": 0})])
        out.append({"driver_id": p["user_id"], "name": p["name"], "upi": p.get("payout_upi"), "earned": earned,
                    "paid": paid, "pending": max(earned - paid, 0)})
    history = [clean(x) async for x in db.driver_payouts.find({}, {"_id": 0}).sort("created_at", -1).limit(100)]
    return {"drivers": out, "history": history}


class PayoutIn(BaseModel):
    driver_id: str
    amount: int
    reference: str


@router.post("/payouts")
async def record_payout(body: PayoutIn, user: dict = Depends(FINANCE)):
    if body.amount <= 0 or not body.reference.strip():
        raise HTTPException(400, "Enter amount and transfer reference")
    doc = {"id": new_id(), **body.model_dump(), "status": "PAID", "by": user["id"], "created_at": now_iso()}
    await db.driver_payouts.insert_one(dict(doc))
    await audit(user, "payout_recorded", "driver_payout", doc["id"], body.model_dump())
    await notify(body.driver_id, "Payout sent", f"₹{body.amount / 100:,.2f} transferred. Ref {body.reference}")
    return clean(doc)


# ------------------------------------------------------------------ support & enquiries
@router.get("/tickets")
async def tickets(status: str = "", mine: bool = False, user: dict = Depends(SUPPORT)):
    q = {"status": status} if status else {}
    if mine:
        q["assigned_to_id"] = user["id"]
    return [t async for t in db.support_tickets.find(q, {"_id": 0}).sort("updated_at", -1).limit(300)]


class AdminReplyIn(BaseModel):
    text: str
    internal: bool = False


@router.post("/tickets/{tid}/reply")
async def ticket_reply(tid: str, body: AdminReplyIn, user: dict = Depends(SUPPORT)):
    t = await db.support_tickets.find_one({"id": tid}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    await db.support_tickets.update_one({"id": tid}, {"$push": {"messages": {
        "by": "support", "by_id": user["id"], "name": user.get("name"), "text": body.text, "internal": body.internal, "at": now_iso()}},
        "$set": {"updated_at": now_iso(), "status": "in_progress", "assigned_to": t.get("assigned_to") or user.get("name"),
                 "assigned_to_id": t.get("assigned_to_id") or user["id"]}})
    if not body.internal:
        await notify(t["user_id"], "Support replied", f"{t['ref']}: {body.text[:80]}")
    return {"ok": True}


class TicketStatusIn(BaseModel):
    status: str
    priority: Optional[str] = None
    resolution: str = ""


@router.post("/tickets/{tid}/status")
async def ticket_status(tid: str, body: TicketStatusIn, user: dict = Depends(SUPPORT)):
    upd = {"status": body.status, "updated_at": now_iso()}
    if body.priority:
        upd["priority"] = body.priority
    if body.resolution:
        upd["resolution"] = body.resolution
    await db.support_tickets.update_one({"id": tid}, {"$set": upd})
    await audit(user, "ticket_status", "ticket", tid, upd)
    return {"ok": True}


@router.get("/enquiries")
async def enquiries(user: dict = Depends(SUPPORT)):
    return [e async for e in db.corporate_enquiries.find({}, {"_id": 0}).sort("created_at", -1).limit(300)]


class EnqIn(BaseModel):
    status: str
    note: str = ""
    quote_amount: Optional[int] = None


@router.post("/enquiries/{eid}")
async def update_enquiry(eid: str, body: EnqIn, user: dict = Depends(SUPPORT)):
    upd = {"$set": {"status": body.status, "updated_at": now_iso()}}
    if body.quote_amount:
        upd["$set"]["quote_amount"] = body.quote_amount
    if body.note:
        upd["$push"] = {"notes": {"text": body.note, "by": user.get("name"), "at": now_iso()}}
    await db.corporate_enquiries.update_one({"id": eid}, upd)
    return {"ok": True}


@router.get("/audit-logs")
async def audit_logs(user: dict = Depends(SUPER)):
    return [a async for a in db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200)]


# ------------------------------------------------------------------ owner intelligence
@router.get("/owner/overview")
async def owner_overview(period: str = "month", city_id: str = "", service_id: str = "", start: Optional[str] = None,
                         end: Optional[str] = None, user: dict = Depends(OWNER)):
    settings = await get_settings()
    cur, s, e = await period_bookings(period, city_id, service_id, start, end)
    prev, ps, pe = await period_bookings(period, city_id, service_id, start, end, prev=True)
    m = await metrics(cur, s, e, settings)
    pm = await metrics(prev, ps, pe, settings)
    accepted = await db.booking_assignments.count_documents({"status": "ACCEPTED", "created_at": {"$gte": s.isoformat()}})
    responded = await db.booking_assignments.count_documents({"status": {"$in": ["ACCEPTED", "DECLINED", "EXPIRED"]},
                                                              "created_at": {"$gte": s.isoformat()}})
    approved = await db.driver_profiles.count_documents({"status": "APPROVED"})
    active_drivers = len({b["driver_id"] for b in cur if b.get("driver_id") and b["status"] == "COMPLETED"})
    m["acceptance_rate"] = round(accepted * 100 / responded, 1) if responded else None
    m["drivers_approved"] = approved
    m["active_drivers"] = active_drivers
    m["revenue_per_active_driver"] = int(m["revenue"] / active_drivers) if active_drivers else 0
    m["driver_utilisation"] = round(active_drivers * 100 / approved, 1) if approved else 0
    pnl = {
        "income_by_service": _sum_by(cur, "service_name", completed_only=True),
        "revenue": m["revenue"], "driver_payouts": m["payouts"], "gateway_fees": m["gateway_fees"],
        "refunds": m["refunds"], "contribution": m["contribution"], "expenses": m["expenses_by_category"],
        "opex": m["opex"], "operating_profit": m["operating_profit"],
        "tax_collected": sum(b["fare"].get("tax", 0) for b in cur if b["status"] == "COMPLETED"),
        "collected_for_drivers": m["payouts"],
    }
    data_quality = []
    if not m["opex"]:
        data_quality.append("No operating expenses recorded for this period — profit may be overstated.")
    unrec = await db.payments.count_documents({"status": "created"})
    if unrec:
        data_quality.append(f"{unrec} payment order(s) are open/unconfirmed with the gateway.")
    no_inv = sum(1 for b in cur if b["status"] == "COMPLETED" and not b.get("invoice_number"))
    if no_inv:
        data_quality.append(f"{no_inv} completed booking(s) without an invoice number.")
    if any(b.get("is_demo") for b in cur):
        data_quality.append("This period includes synthetic demo data. Clear it before going live.")
    return {"current": m, "previous": pm, "pnl": pnl, "period_start": s.isoformat(), "period_end": e.isoformat(),
            "basis": "Accrual for revenue (completed trips), cash for collections", "data_quality": data_quality,
            "definitions": KPI_DEFINITIONS}


KPI_DEFINITIONS = {
    "gbv": "Gross booking value: total fare incl. GST of all non-cancelled bookings created in the period.",
    "revenue": "Earned service revenue: pre-tax fare (after discounts) of completed bookings.",
    "collections": "Money actually received (online + cash) for bookings in the period.",
    "receivables": "Balance due on completed bookings not yet collected.",
    "payouts": "Driver share of completed bookings (driver_share_percent of revenue) plus adjustments.",
    "contribution": "Revenue − driver payouts − gateway fees − refunds.",
    "operating_profit": "Contribution − operating expenses recorded in the period.",
    "repeat_rate": "Share of customers with more than one booking in the period.",
    "acceptance_rate": "Accepted offers ÷ offers accepted, declined or expired.",
}


def _sum_by(bookings, key, completed_only=False):
    out = defaultdict(int)
    for b in bookings:
        if completed_only and b["status"] != "COMPLETED":
            continue
        out[b.get(key) or "—"] += b["fare"].get("subtotal", 0) - b["fare"].get("discount", 0)
    return dict(out)


async def _segment(group_key: str, period: str, settings: dict):
    bookings, s, e = await period_bookings(period)
    groups = defaultdict(list)
    for b in bookings:
        groups[b.get(group_key)].append(b)
    rows = []
    for k, items in groups.items():
        completed = [b for b in items if b["status"] == "COMPLETED"]
        revenue = sum(b["fare"].get("subtotal", 0) - b["fare"].get("discount", 0) for b in completed)
        payouts = sum(b.get("driver_payout", 0) for b in completed)
        collected = sum(b.get("amount_paid", 0) for b in items)
        fees = int(collected * settings.get("gateway_fee_percent", 2) / 100)
        contribution = revenue - payouts - fees
        rows.append({"key": k, "name": items[0].get("service_name") if group_key == "service_id" else (items[0].get("city_name") or k),
                     "requests": len(items), "completed": len(completed),
                     "cancelled": sum(1 for b in items if b["status"] == "CANCELLED"),
                     "cancellation_rate": round(sum(1 for b in items if b["status"] == "CANCELLED") * 100 / len(items), 1),
                     "gbv": sum(b["fare"].get("total", 0) for b in items if b["status"] != "CANCELLED"),
                     "revenue": revenue, "collections": collected, "payouts": payouts, "gateway_fees": fees,
                     "receivables": sum(b.get("balance_due", 0) for b in completed),
                     "contribution": contribution, "margin": round(contribution * 100 / revenue, 1) if revenue else 0,
                     "unassigned": sum(1 for b in items if b["status"] in ("AWAITING_ASSIGNMENT", "ASSIGNED"))})
    return sorted(rows, key=lambda r: -r["revenue"])


@router.get("/owner/services")
async def owner_services(period: str = "fy", user: dict = Depends(OWNER)):
    return await _segment("service_id", period, await get_settings())


@router.get("/owner/cities")
async def owner_cities(period: str = "fy", user: dict = Depends(OWNER)):
    rows = await _segment("city_id", period, await get_settings())
    for r in rows:
        r["drivers_approved"] = await db.driver_profiles.count_documents({"city_id": r["key"], "status": "APPROVED"})
        r["drivers_online"] = await db.driver_profiles.count_documents({"city_id": r["key"], "status": "APPROVED", "online": True})
        r["fulfilment"] = round(r["completed"] * 100 / max(r["requests"] - r["cancelled"], 1), 1)
    return rows


@router.get("/owner/insights")
async def owner_insights(user: dict = Depends(OWNER)):
    settings = await get_settings()
    services = await _segment("service_id", "fy", settings)
    cities = await owner_cities("fy", user)
    insights = []
    for s in services:
        if s["revenue"] and s["margin"] < 20:
            insights.append(_ins(f"Low margin on {s['name']}", f"Contribution margin {s['margin']}% on {s['completed']} completed trips.",
                                 "Each trip contributes little towards fixed costs.", f"Review {s['name']} tariff or driver payout ratio.",
                                 "Margin above 25% within one quarter.", "Medium", "Driver share and fees stay constant.", "Owner / Finance"))
        if s["requests"] >= 5 and s["cancellation_rate"] > 15:
            insights.append(_ins(f"High cancellations in {s['name']}", f"{s['cancellation_rate']}% of {s['requests']} requests cancelled.",
                                 "Lost revenue and wasted dispatch effort.", "Call cancelled customers; tighten reminders and cancellation fee.",
                                 "Cancellation rate under 10%.", "Medium", "Cancellation reasons are recorded accurately.", "Operations Manager"))
    for c in cities:
        if c["requests"] >= 5 and c["drivers_online"] <= 1:
            insights.append(_ins(f"Driver supply gap in {c['name']}", f"{c['requests']} requests, only {c['drivers_online']} driver(s) online, {c['drivers_approved']} approved.",
                                 "Bookings may go unassigned and customers may churn.", f"Run a driver recruitment drive in {c['name']}.",
                                 "Fulfilment above 90%.", "High", "Demand continues at current levels.", "Driver Verification Staff"))
        if c["receivables"] > 500000:
            insights.append(_ins(f"Growing receivables in {c['name']}", f"₹{c['receivables'] / 100:,.0f} outstanding on completed trips.",
                                 "Cash is tied up in unpaid balances.", "Follow up with customers; push online balance payment links.",
                                 "Receivables reduced by 50% in 30 days.", "High", "Balances are genuinely unpaid.", "Finance Staff"))
    if not insights:
        insights.append(_ins("Business is stable", "No metric crossed alert thresholds this financial year.", "—",
                             "Keep monitoring weekly.", "—", "Low", "Thresholds: margin<20%, cancellations>15%.", "Owner"))
    return insights


def _ins(finding, evidence, impact, action, outcome, confidence, assumptions, owner):
    return {"finding": finding, "evidence": evidence, "impact": impact, "recommended_action": action,
            "expected_outcome": outcome, "confidence": confidence, "assumptions": assumptions, "action_owner": owner}


class ActionIn(BaseModel):
    finding: str
    action: str
    priority: str = "Medium"
    impact: str = ""
    cost: str = ""
    assigned_to: str = ""
    target_date: str = ""
    status: str = "Suggested"
    success_metric: str = ""
    report: str = ""


@router.get("/owner/actions")
async def actions(user: dict = Depends(OWNER)):
    return [a async for a in db.action_plans.find({}, {"_id": 0}).sort("created_at", -1)]


@router.post("/owner/actions")
async def add_action(body: ActionIn, user: dict = Depends(OWNER)):
    count = await db.action_plans.count_documents({})
    doc = {"id": new_id(), "code": f"ACT-{count + 1:03d}", **body.model_dump(), "created_by": user["id"], "created_at": now_iso()}
    await db.action_plans.insert_one(dict(doc))
    return clean(doc)


@router.put("/owner/actions/{aid}")
async def update_action(aid: str, body: dict, user: dict = Depends(OWNER)):
    allowed = {"status", "assigned_to", "target_date", "priority", "action", "success_metric"}
    data = {k: v for k, v in body.items() if k in allowed}
    if data.get("status") in ("Approved", "Rejected") and user["role"] not in ("owner", "super_admin"):
        raise HTTPException(403, "Only the owner can approve or reject actions")
    await db.action_plans.update_one({"id": aid}, {"$set": data})
    await audit(user, "action_plan_update", "action_plan", aid, data)
    return {"ok": True}
