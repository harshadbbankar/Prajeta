"""Prajeta API: auth (WhatsApp OTP), public website, customer bookings, payments, support."""
import os
import hmac
import html
import json
import hashlib
import secrets
import logging
from datetime import timedelta
from typing import Optional

import razorpay
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

from core import (db, client, now, now_iso, new_id, public_ref, normalize_phone, make_token, get_current_user,
                  require_customer, notify, notify_admins, get_settings, get_object, init_storage, clean, rupees,
                  ADMIN_ROLES, logger)
from logic import compute_fare, confirm_booking, add_event, recompute_payment_status
from seed import seed
import driver_routes
import admin_routes

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="Prajeta API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_VERIFY = os.environ.get("TWILIO_VERIFY_SERVICE")
DEMO_PHONES = {p.strip() for p in (os.environ.get("DEMO_PHONES") or "").split(",") if p.strip()}
DEMO_OTP = os.environ.get("DEMO_OTP") or ""
RZP_KEY = os.environ.get("RAZORPAY_KEY_ID")
RZP_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")
RZP_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET")


def twilio_enabled() -> bool:
    return bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_VERIFY)


def rzp_client():
    if not (RZP_KEY and RZP_SECRET):
        raise HTTPException(503, "Online payments are not configured yet. Please contact support.")
    return razorpay.Client(auth=(RZP_KEY, RZP_SECRET))


def hash_code(phone: str, code: str) -> str:
    return hashlib.sha256(f"{phone}:{code}:{os.environ['JWT_SECRET']}".encode()).hexdigest()


# ===================================================================== AUTH
class OtpSendIn(BaseModel):
    phone: str


class OtpVerifyIn(BaseModel):
    phone: str
    code: str
    role: str = "customer"  # customer | driver (for new users only)
    name: Optional[str] = None


@api.post("/auth/otp/send")
async def otp_send(body: OtpSendIn):
    phone = normalize_phone(body.phone)
    since = (now() - timedelta(minutes=10)).isoformat()
    recent = await db.otp_requests.count_documents({"phone": phone, "created_at": {"$gt": since}})
    if recent >= 5:
        raise HTTPException(429, "Too many OTP requests. Please wait 10 minutes.")
    await db.otp_requests.insert_one({"phone": phone, "created_at": now_iso()})
    if phone in DEMO_PHONES and DEMO_OTP:
        return {"channel": "demo", "phone": phone, "message": "Demo account: use the demo code."}
    if twilio_enabled():
        def _send():
            from twilio.rest import Client
            return Client(TWILIO_SID, TWILIO_TOKEN).verify.v2.services(TWILIO_VERIFY).verifications.create(
                to=phone, channel="whatsapp")
        try:
            await run_in_threadpool(_send)
        except Exception as e:
            logger.error("WhatsApp OTP send failed: %s", e)
            raise HTTPException(502, "Could not send WhatsApp OTP. Check the number has WhatsApp and try again.")
        return {"channel": "whatsapp", "phone": phone}
    # Preview fallback: WhatsApp provider not configured yet -> code shown on screen
    code = f"{secrets.randbelow(900000) + 100000}"
    await db.otps.update_one({"phone": phone}, {"$set": {"hash": hash_code(phone, code), "attempts": 0,
                                                      "expires_at": (now() + timedelta(minutes=10)).isoformat()}},
                             upsert=True)
    return {"channel": "preview", "phone": phone, "dev_code": code}


async def check_code(phone: str, code: str) -> bool:
    if phone in DEMO_PHONES and DEMO_OTP:
        return hmac.compare_digest(code, DEMO_OTP)
    if twilio_enabled():
        def _check():
            from twilio.rest import Client
            return Client(TWILIO_SID, TWILIO_TOKEN).verify.v2.services(TWILIO_VERIFY).verification_checks.create(
                to=phone, code=code)
        try:
            res = await run_in_threadpool(_check)
            return res.status == "approved"
        except Exception as e:
            logger.warning("OTP check failed: %s", e)
            return False
    rec = await db.otps.find_one({"phone": phone})
    if not rec or rec["expires_at"] < now_iso() or rec.get("attempts", 0) >= 5:
        return False
    if hmac.compare_digest(rec["hash"], hash_code(phone, code)):
        await db.otps.delete_one({"phone": phone})
        return True
    await db.otps.update_one({"phone": phone}, {"$inc": {"attempts": 1}})
    return False


@api.post("/auth/otp/verify")
async def otp_verify(body: OtpVerifyIn):
    phone = normalize_phone(body.phone)
    if not await check_code(phone, body.code.strip()):
        raise HTTPException(400, "Incorrect or expired code")
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        role = body.role if body.role in ("customer", "driver") else "customer"
        user = {"id": new_id(), "phone": phone, "name": (body.name or "").strip(), "role": role, "city_id": None,
                "created_at": now_iso(), "source": "app"}
        await db.users.insert_one(dict(user))
    elif user.get("restricted"):
        raise HTTPException(403, "Your account is restricted. Please contact support.")
    return {"token": make_token(user["id"]), "user": user}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


class MeIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    city_id: Optional[str] = None


@api.put("/auth/me")
async def update_me(body: MeIn, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.users.update_one({"id": user["id"]}, {"$set": data})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


# ===================================================================== PUBLIC
@api.get("/public/config")
async def public_config():
    s = await get_settings()
    settings = {k: s.get(k) for k in ("company_name", "legal_name", "tagline", "support_phone", "support_email",
                                      "whatsapp_link", "business_hours", "address", "currency", "tax_rate",
                                      "advance_percent", "cash_enabled", "bookings_enabled", "pages")}
    cities = [c async for c in db.service_areas.find({"enabled": True}, {"_id": 0}).sort("name", 1)]
    services = [c async for c in db.service_categories.find({"active": True}, {"_id": 0}).sort("order", 1)]
    from seed import FAQS
    return {"settings": settings, "cities": cities, "services": services, "faqs": FAQS,
            "payments_enabled": bool(RZP_KEY and RZP_SECRET), "otp_channel": "whatsapp" if twilio_enabled() else "preview"}


class FareIn(BaseModel):
    service_id: str
    city_id: str
    date: str = ""
    time: str = "10:00"
    hours: float = 0
    days: int = 1
    coupon: Optional[str] = None


async def load_service_city(service_id: str, city_id: str):
    s = await db.service_categories.find_one({"id": service_id, "active": True}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Service not available")
    c = await db.service_areas.find_one({"id": city_id, "enabled": True}, {"_id": 0})
    if not c:
        raise HTTPException(400, "We do not operate in this city yet")
    return s, c


@api.post("/public/fare-estimate")
async def fare_estimate(body: FareIn):
    s, c = await load_service_city(body.service_id, body.city_id)
    return await compute_fare(s, c, body.hours, body.days, body.time, body.coupon)


class EnquiryIn(BaseModel):
    type: str  # corporate | monthly | permanent | contact | driver
    name: str
    phone: str
    email: Optional[str] = None
    company: Optional[str] = None
    city_id: Optional[str] = None
    drivers_needed: Optional[int] = None
    message: Optional[str] = None


@api.post("/public/enquiry")
async def enquiry(body: EnquiryIn):
    if not body.name.strip():
        raise HTTPException(400, "Please enter your name")
    phone = normalize_phone(body.phone)
    doc = {"id": new_id(), "ref": "ENQ-" + new_id()[:6].upper(), **body.model_dump(), "phone": phone,
           "status": "NEW", "notes": [], "created_at": now_iso()}
    await db.corporate_enquiries.insert_one(dict(doc))
    await notify_admins("New enquiry", f"{body.type.title()} enquiry from {body.name}")
    return {"ref": doc["ref"]}


@api.get("/public/track/{ref}")
async def track(ref: str, phone: str):
    b = await db.bookings.find_one({"ref": ref.strip().upper()}, {"_id": 0})
    if not b or b["customer_phone"] != normalize_phone(phone):
        raise HTTPException(404, "No booking found for this reference and mobile number")
    return {k: b.get(k) for k in ("ref", "service_name", "city_id", "date", "time", "status", "payment_status")}


# ===================================================================== BOOKINGS (customer)
class BookingIn(BaseModel):
    service_id: str
    city_id: str
    pickup: str
    destination: Optional[str] = ""
    date: str
    time: str
    hours: float = 0
    days: int = 1
    vehicle_type: str = "Sedan"
    transmission: str = "Manual"
    notes: Optional[str] = ""
    coupon: Optional[str] = None
    contact_name: Optional[str] = None
    idempotency_key: str


def customer_view(b: dict) -> dict:
    b = dict(b)
    if b["status"] in ("PAYMENT_PENDING", "QUOTE_REQUESTED", "QUOTED", "CANCELLED"):
        b.pop("trip_otp", None)
    return b


@api.post("/bookings")
async def create_booking(body: BookingIn, user: dict = Depends(require_customer)):
    existing = await db.bookings.find_one({"customer_id": user["id"], "idempotency_key": body.idempotency_key}, {"_id": 0})
    if existing:
        return customer_view(existing)
    settings = await get_settings()
    if not settings.get("bookings_enabled", True):
        raise HTTPException(503, "New bookings are paused right now. Please contact support.")
    if not body.pickup.strip():
        raise HTTPException(400, "Please enter the pickup address")
    s, c = await load_service_city(body.service_id, body.city_id)
    if body.date < now().date().isoformat():
        raise HTTPException(400, "Choose today or a future date")
    fare = await compute_fare(s, c, body.hours, body.days, body.time, body.coupon)
    quote = fare.get("quote_required")
    status = "QUOTE_REQUESTED" if quote else "PAYMENT_PENDING"
    driver_payout = 0 if quote else int((fare["subtotal"] - fare["discount"]) * settings.get("driver_share_percent", 70) / 100)
    if body.contact_name and not user.get("name"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.contact_name}})
        user["name"] = body.contact_name
    b = {"id": new_id(), "ref": public_ref(), "customer_id": user["id"], "customer_name": user.get("name") or body.contact_name,
         "customer_phone": user["phone"], "service_id": s["id"], "service_name": s["name"], "city_id": c["id"],
         "city_name": c["name"], "pickup": body.pickup.strip(), "destination": (body.destination or "").strip(),
         "date": body.date, "time": body.time, "hours": fare.get("hours", body.hours), "days": body.days,
         "vehicle_type": body.vehicle_type, "transmission": body.transmission, "notes": body.notes,
         "fare": fare if not quote else {}, "quote_required": bool(quote), "driver_payout": driver_payout,
         "status": status, "payment_status": "PENDING", "amount_paid": 0,
         "balance_due": 0 if quote else fare["total"], "driver_id": None, "offered_driver_id": None,
         "idempotency_key": body.idempotency_key, "created_at": now_iso(), "updated_at": now_iso(),
         "source": user.get("source", "app")}
    await db.bookings.insert_one(dict(b))
    await add_event(b["id"], "REQUESTED", user)
    if quote:
        await notify_admins("Quote requested", f"{s['name']} quote needed for {b['ref']}", b["id"])
    return customer_view(b)


@api.get("/bookings")
async def my_bookings(user: dict = Depends(require_customer)):
    return [customer_view(b) async for b in db.bookings.find({"customer_id": user["id"]}, {"_id": 0}).sort("created_at", -1)]


async def own_booking(booking_id: str, user: dict) -> dict:
    b = await db.bookings.find_one({"id": booking_id, "customer_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    return b


@api.get("/bookings/{booking_id}")
async def booking_detail(booking_id: str, user: dict = Depends(require_customer)):
    b = await own_booking(booking_id, user)
    events = [clean(e) async for e in db.trip_events.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1)]
    payments = [clean(p) async for p in db.payments.find({"booking_id": booking_id},
                                                       {"_id": 0, "attempts": 0}).sort("created_at", -1)]
    review = await db.reviews.find_one({"booking_id": booking_id}, {"_id": 0})
    driver = None
    if b.get("driver_id") and b["status"] not in ("CANCELLED",):
        p = await db.driver_profiles.find_one({"user_id": b["driver_id"]}, {"_id": 0})
        if p:
            driver = {"name": p["name"], "phone": p["phone"] if b["status"] != "COMPLETED" else None,
                      "experience_years": p.get("experience_years"), "rating": p.get("rating"), "verified": True}
    return {**customer_view(b), "events": events, "payments": payments, "review": review, "driver": driver}


class CancelIn(BaseModel):
    reason: str = ""


@api.post("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, body: CancelIn, user: dict = Depends(require_customer)):
    b = await own_booking(booking_id, user)
    if b["status"] in ("IN_PROGRESS", "COMPLETED", "CANCELLED", "DRIVER_ARRIVED"):
        raise HTTPException(400, "This booking can no longer be cancelled")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "CANCELLED", "cancel_reason": body.reason,
                                                             "cancelled_by": "customer", "cancelled_at": now_iso()}})
    await db.booking_assignments.update_many({"booking_id": booking_id, "status": "OFFERED"}, {"$set": {"status": "WITHDRAWN"}})
    await add_event(booking_id, "CANCELLED", user, body.reason)
    if b.get("driver_id"):
        await notify(b["driver_id"], "Booking cancelled", f"{b['ref']} was cancelled by the customer.", booking_id)
    if b.get("amount_paid"):
        await notify_admins("Refund review needed", f"{b['ref']} cancelled after advance payment", booking_id)
    return {"ok": True}


class RescheduleIn(BaseModel):
    date: str
    time: str


@api.post("/bookings/{booking_id}/reschedule")
async def reschedule(booking_id: str, body: RescheduleIn, user: dict = Depends(require_customer)):
    b = await own_booking(booking_id, user)
    if b["status"] not in ("PAYMENT_PENDING", "QUOTE_REQUESTED", "QUOTED", "AWAITING_ASSIGNMENT"):
        raise HTTPException(400, "A driver is already assigned. Please contact support to reschedule.")
    if body.date < now().date().isoformat():
        raise HTTPException(400, "Choose today or a future date")
    await db.bookings.update_one({"id": booking_id}, {"$set": {"date": body.date, "time": body.time, "updated_at": now_iso()}})
    await add_event(booking_id, "RESCHEDULED", user, f"{body.date} {body.time}")
    return {"ok": True}


class ReviewIn(BaseModel):
    rating: int
    comment: str = ""


@api.post("/bookings/{booking_id}/review")
async def review(booking_id: str, body: ReviewIn, user: dict = Depends(require_customer)):
    b = await own_booking(booking_id, user)
    if b["status"] != "COMPLETED":
        raise HTTPException(400, "You can rate after the trip is completed")
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, "Rating must be 1 to 5")
    if await db.reviews.find_one({"booking_id": booking_id}):
        raise HTTPException(400, "You have already rated this trip")
    await db.reviews.insert_one({"id": new_id(), "booking_id": booking_id, "customer_id": user["id"],
                                 "driver_id": b.get("driver_id"), "rating": body.rating, "comment": body.comment,
                                 "created_at": now_iso()})
    ratings = [r["rating"] async for r in db.reviews.find({"driver_id": b.get("driver_id")}, {"_id": 0, "rating": 1})]
    if ratings:
        await db.driver_profiles.update_one({"user_id": b["driver_id"]},
                                            {"$set": {"rating": round(sum(ratings) / len(ratings), 1)}})
    return {"ok": True}


# ===================================================================== PAYMENTS (Razorpay)
class PayIn(BaseModel):
    booking_id: str


def pay_view(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "booking_id", "kind", "amount", "currency", "method", "status",
                                  "razorpay_order_id", "razorpay_payment_id", "created_at", "paid_at", "refunded_amount")}


@api.post("/payments/create")
async def create_payment(body: PayIn, request: Request, user: dict = Depends(require_customer)):
    b = await own_booking(body.booking_id, user)
    if b["status"] in ("PAYMENT_PENDING", "QUOTED"):
        kind, amount = "advance", b["fare"]["advance"]
    elif b["status"] not in ("CANCELLED", "QUOTE_REQUESTED") and b.get("balance_due", 0) > 0:
        kind, amount = "balance", b["balance_due"]
    else:
        raise HTTPException(400, "Nothing to pay for this booking right now")
    # Reuse an open order (duplicate-charge protection)
    p = await db.payments.find_one({"booking_id": b["id"], "kind": kind, "status": "created", "amount": amount}, {"_id": 0})
    if not p:
        rz = rzp_client()
        try:
            order = await run_in_threadpool(rz.order.create, {
                "amount": amount, "currency": "INR", "receipt": f"{b['ref']}-{kind[:3]}-{new_id()[:6]}",
                "notes": {"booking_id": b["id"], "booking_ref": b["ref"], "kind": kind}, "payment_capture": 1})
        except Exception as e:
            logger.error("Razorpay order create failed: %s", e)
            raise HTTPException(502, "Payment gateway is unavailable. Please try again.")
        p = {"id": new_id(), "booking_id": b["id"], "customer_id": user["id"], "kind": kind, "amount": amount,
             "currency": "INR", "method": "razorpay", "status": "created", "razorpay_order_id": order["id"],
             "attempts": [{"at": now_iso(), "event": "order_created"}], "created_at": now_iso()}
        await db.payments.insert_one(dict(p))
    token = request.headers.get("Authorization", "")[7:]
    return {**pay_view(p), "checkout_path": f"/api/payments/{p['id']}/checkout?token={token}"}


async def mark_paid(p: dict, payment_id: str, source: str):
    upd = await db.payments.find_one_and_update(
        {"id": p["id"], "status": {"$in": ["created", "failed"]}},
        {"$set": {"status": "paid", "razorpay_payment_id": payment_id, "paid_at": now_iso(), "verified_by": source},
         "$push": {"attempts": {"at": now_iso(), "event": f"paid:{source}"}}}, projection={"_id": 0})
    if not upd:
        return
    await recompute_payment_status(p["booking_id"])
    if p["kind"] == "advance":
        await confirm_booking(p["booking_id"])
    else:
        await notify(p["customer_id"], "Payment received", f"We received {rupees(p['amount'])}. Thank you!", p["booking_id"])


@api.get("/payments/{pid}")
async def payment_status(pid: str, user: dict = Depends(require_customer)):
    p = await db.payments.find_one({"id": pid, "customer_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Payment not found")
    if p["status"] == "created" and RZP_KEY and RZP_SECRET:
        # recovery path if the checkout callback/webhook was missed
        try:
            pays = await run_in_threadpool(rzp_client().order.payments, p["razorpay_order_id"])
            for item in pays.get("items", []):
                if item.get("status") == "captured":
                    await mark_paid(p, item["id"], "order_poll")
                    break
                if item.get("status") == "failed":
                    await db.payments.update_one({"id": pid, "status": "created"},
                                                 {"$push": {"attempts": {"at": now_iso(), "event": "failed_attempt"}}})
        except Exception as e:
            logger.warning("order poll failed: %s", e)
        p = await db.payments.find_one({"id": pid}, {"_id": 0})
    return pay_view(p)


@api.get("/payments/{pid}/checkout", response_class=HTMLResponse)
async def checkout_page(pid: str, user: dict = Depends(require_customer)):
    p = await db.payments.find_one({"id": pid, "customer_id": user["id"]}, {"_id": 0})
    if not p or p["status"] != "created":
        return HTMLResponse("<h3 style='font-family:sans-serif'>This payment is already completed or unavailable. You can close this window.</h3>")
    b = await db.bookings.find_one({"id": p["booking_id"]}, {"_id": 0})
    rzp_client()
    key = html.escape(RZP_KEY, quote=True)
    oid = html.escape(p["razorpay_order_id"], quote=True)
    desc = html.escape(f"{b['service_name']} · {b['ref']} · {'20% advance' if p['kind'] == 'advance' else 'Balance'}", quote=True)
    phone = html.escape(user["phone"], quote=True)
    name = html.escape(user.get("name") or "", quote=True)
    return HTMLResponse(f"""<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prajeta Payment</title><style>body{{font-family:-apple-system,Segoe UI,sans-serif;background:#F3F4F6;color:#171717;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}.c{{background:#fff;border-radius:20px;padding:32px;
max-width:360px;text-align:center}}.b{{background:#E53935;color:#fff;border:0;border-radius:12px;padding:14px 20px;font-size:16px;
font-weight:700;width:100%;margin-top:16px}}</style></head><body><div class="c" id="c"><h2>Prajeta</h2>
<p>{desc}</p><h1>₹{p['amount'] / 100:,.2f}</h1><button class="b" onclick="go()">Pay securely</button>
<p style="color:#6B7280;font-size:12px">Secured by Razorpay · Test mode</p></div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
function done(msg){{document.getElementById('c').innerHTML='<h2>'+msg+'</h2><p>You can close this window and return to the Prajeta app.</p>';
setTimeout(function(){{try{{window.close()}}catch(e){{}}}},2500);}}
function go(){{var rz=new Razorpay({{key:"{key}",amount:{p['amount']},currency:"INR",name:"Prajeta",description:"{desc}",order_id:"{oid}",
prefill:{{contact:"{phone}",name:"{name}"}},theme:{{color:"#E53935"}},
handler:function(r){{fetch("/api/payments/{pid}/verify",{{method:"POST",headers:{{"Content-Type":"application/json"}},body:JSON.stringify(r)}})
.then(function(x){{done(x.ok?"Payment successful ✓":"Payment could not be verified")}});}},
modal:{{ondismiss:function(){{done("Payment cancelled")}}}}}});rz.on('payment.failed',function(){{}});rz.open();}}
go();</script></body></html>""")


class VerifyIn(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


@api.post("/payments/{pid}/verify")
async def verify_payment(pid: str, body: VerifyIn):
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p or not hmac.compare_digest(p["razorpay_order_id"] or "", body.razorpay_order_id):
        raise HTTPException(400, "Order mismatch")
    rzp_client()
    expected = hmac.new(RZP_SECRET.encode(), f"{p['razorpay_order_id']}|{body.razorpay_payment_id}".encode(),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        await db.payments.update_one({"id": pid}, {"$push": {"attempts": {"at": now_iso(), "event": "bad_signature"}}})
        raise HTTPException(400, "Invalid payment signature")
    await mark_paid(p, body.razorpay_payment_id, "checkout_signature")
    return {"ok": True}


@api.post("/payments/webhook")
async def razorpay_webhook(request: Request):
    raw = await request.body()
    if not RZP_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook not configured")
    expected = hmac.new(RZP_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(400, "Invalid webhook signature")
    event_id = request.headers.get("x-razorpay-event-id") or hashlib.sha256(raw).hexdigest()
    if await db.webhook_events.find_one({"event_id": event_id}):
        return {"ok": True, "duplicate": True}
    await db.webhook_events.insert_one({"event_id": event_id, "created_at": now_iso()})
    event = json.loads(raw)
    ent = event.get("payload", {}).get("payment", {}).get("entity", {})
    p = await db.payments.find_one({"razorpay_order_id": ent.get("order_id")}, {"_id": 0}) if ent else None
    if p and event.get("event") in ("payment.captured", "order.paid"):
        await mark_paid(p, ent["id"], "webhook")
    elif p and event.get("event") == "payment.failed":
        await db.payments.update_one({"id": p["id"]}, {"$push": {"attempts": {"at": now_iso(), "event": "failed:webhook"}}})
    return {"ok": True}


@api.get("/invoices/{booking_id}", response_class=HTMLResponse)
async def invoice(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b or (user["role"] not in ADMIN_ROLES and b["customer_id"] != user["id"]):
        raise HTTPException(404, "Invoice not found")
    s = await get_settings()
    f = b.get("fare") or {}
    rows = "".join(f"<tr><td>{html.escape(l['label'])}</td><td align=right>{rupees(l['amount'])}</td></tr>" for l in f.get("lines", []))
    pays = "".join([f"<tr><td>{p['kind'].title()} · {p['method']} · {(p.get('paid_at') or '')[:10]}</td><td align=right>{rupees(p['amount'])}</td></tr>"
                    async for p in db.payments.find({"booking_id": booking_id, "status": "paid"}, {"_id": 0})])
    title = f"Tax Invoice {b['invoice_number']}" if b.get("invoice_number") else "Payment Receipt"
    return HTMLResponse(f"""<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1">
<title>{title}</title><style>body{{font-family:-apple-system,Segoe UI,sans-serif;color:#171717;max-width:640px;margin:24px auto;padding:16px}}
table{{width:100%;border-collapse:collapse}}td{{padding:8px 0;border-bottom:1px solid #E5E7EB}}h1{{color:#E53935}}</style></head><body>
<h1>{html.escape(s.get('company_name', 'Prajeta'))}</h1><p>{html.escape(s.get('legal_name', ''))}<br>{html.escape(s.get('support_email', ''))}</p>
<h2>{title}</h2><p>Booking <b>{b['ref']}</b> · {html.escape(b['service_name'])} · {b['date']} {b['time']}<br>
Customer: {html.escape(b.get('customer_name') or '')} ({b['customer_phone']})</p>
<table>{rows}<tr><td>Discount</td><td align=right>-{rupees(f.get('discount', 0))}</td></tr>
<tr><td>GST ({f.get('tax_rate', 18)}%)</td><td align=right>{rupees(f.get('tax', 0))}</td></tr>
<tr><td><b>Total</b></td><td align=right><b>{rupees(f.get('total', 0))}</b></td></tr></table>
<h3>Payments</h3><table>{pays or '<tr><td>No payments yet</td><td></td></tr>'}</table>
<p><b>Balance due: {rupees(b.get('balance_due', 0))}</b></p><button onclick="window.print()">Print / Save PDF</button></body></html>""")


# ===================================================================== SUPPORT & NOTIFICATIONS
class TicketIn(BaseModel):
    subject: str
    message: str
    category: str = "general"
    booking_id: Optional[str] = None


@api.get("/tickets")
async def my_tickets(user: dict = Depends(get_current_user)):
    out = []
    async for t in db.support_tickets.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1):
        t["messages"] = [m for m in t.get("messages", []) if not m.get("internal")]
        out.append(t)
    return out


@api.post("/tickets")
async def create_ticket(body: TicketIn, user: dict = Depends(get_current_user)):
    if not body.subject.strip() or not body.message.strip():
        raise HTTPException(400, "Please add a subject and message")
    ref = None
    if body.booking_id:
        b = await db.bookings.find_one({"id": body.booking_id, "$or": [{"customer_id": user["id"]}, {"driver_id": user["id"]}]}, {"_id": 0})
        if not b:
            raise HTTPException(404, "Booking not found")
        ref = b["ref"]
    t = {"id": new_id(), "ref": "TKT-" + new_id()[:6].upper(), "user_id": user["id"], "user_role": user["role"],
         "user_name": user.get("name") or user["phone"], "booking_id": body.booking_id, "booking_ref": ref,
         "category": body.category, "priority": "high" if body.category == "incident" else "normal",
         "subject": body.subject.strip(), "status": "open", "assigned_to": None,
         "messages": [{"by": user["role"], "name": user.get("name"), "text": body.message.strip(), "internal": False, "at": now_iso()}],
         "created_at": now_iso(), "updated_at": now_iso()}
    await db.support_tickets.insert_one(dict(t))
    await notify_admins("New support ticket", f"{t['ref']}: {t['subject']}", body.booking_id)
    return t


class ReplyIn(BaseModel):
    text: str


@api.post("/tickets/{tid}/reply")
async def reply_ticket(tid: str, body: ReplyIn, user: dict = Depends(get_current_user)):
    t = await db.support_tickets.find_one({"id": tid, "user_id": user["id"]})
    if not t:
        raise HTTPException(404, "Ticket not found")
    await db.support_tickets.update_one({"id": tid}, {"$push": {"messages": {
        "by": user["role"], "name": user.get("name"), "text": body.text, "internal": False, "at": now_iso()}},
        "$set": {"updated_at": now_iso(), "status": "open"}})
    return {"ok": True}


@api.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    items = [n async for n in db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)]
    return {"items": items, "unread": sum(1 for n in items if not n["read"])}


@api.post("/notifications/read")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@api.get("/files/{doc_id}")
async def get_file(doc_id: str, user: dict = Depends(get_current_user)):
    """Private driver documents: owner driver or verification/admin staff only."""
    q = {"documents.id": doc_id}
    if user["role"] not in ("owner", "super_admin", "verification", "ops"):
        q["user_id"] = user["id"]
    p = await db.driver_profiles.find_one(q, {"_id": 0})
    if not p:
        raise HTTPException(404, "File not found")
    d = next(d for d in p["documents"] if d["id"] == doc_id)
    if not d.get("path"):
        raise HTTPException(404, "No file uploaded for this document")
    data, ctype = await run_in_threadpool(get_object, d["path"])
    return Response(content=data, media_type=d.get("content_type") or ctype, headers={"Cache-Control": "private, max-age=600"})


app.include_router(api)
app.include_router(driver_routes.router)
app.include_router(admin_routes.router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("phone", unique=True)
    await db.users.create_index("id", unique=True)
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("ref", unique=True)
    await db.bookings.create_index([("customer_id", 1), ("idempotency_key", 1)])
    await db.payments.create_index("id", unique=True)
    await db.booking_assignments.create_index([("booking_id", 1), ("status", 1)])
    await db.webhook_events.create_index("event_id", unique=True)
    await seed()
    try:
        await run_in_threadpool(init_storage)
    except Exception as e:
        logger.error("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    client.close()
