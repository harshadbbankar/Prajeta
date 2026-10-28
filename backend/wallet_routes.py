"""Referral rewards (customers), driver payout requests, monthly driver statements."""
import calendar
import html
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from core import db, now, now_iso, new_id, notify, require_customer, require_driver, require_roles, get_settings, rupees, audit, clean

router = APIRouter(prefix="/api")
FINANCE = require_roles("owner", "super_admin", "finance")
REF_DEFAULT = 100  # rupees
IST = timedelta(hours=5, minutes=30)


def ref_amounts(s: dict) -> tuple[int, int]:
    """(friend discount, referrer reward) in paise."""
    return (int(float(s.get("referral_friend_amount", REF_DEFAULT) or 0) * 100),
            int(float(s.get("referral_referrer_amount", REF_DEFAULT) or 0) * 100))


async def ensure_code(user: dict) -> str:
    if user.get("referral_code"):
        return user["referral_code"]
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        code = "PRJ" + "".join(secrets.choice(alphabet) for _ in range(5))
        if not await db.users.find_one({"referral_code": code}, {"_id": 0, "id": 1}):
            await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
            return code
    raise HTTPException(500, "Could not create referral code")


async def is_first_booking(user_id: str) -> bool:
    """No other live or past booking (any status except cancelled) — stops stacking a code on several unpaid bookings."""
    return not await db.bookings.find_one({"customer_id": user_id, "status": {"$ne": "CANCELLED"}}, {"_id": 0, "id": 1})


async def referral_discount(code: str, user: Optional[dict], base: int) -> Optional[dict]:
    """If `code` is a customer's referral code, return the friend discount (validated when user is known)."""
    ref = await db.users.find_one({"referral_code": code.upper().strip()}, {"_id": 0, "id": 1, "name": 1})
    if not ref:
        return None
    if user:
        if ref["id"] == user["id"]:
            raise HTTPException(400, "You can't use your own referral code")
        if not await is_first_booking(user["id"]):
            raise HTTPException(400, "Referral codes work only on your first booking")
    friend, _ = ref_amounts(await get_settings())
    return {"discount": min(friend, base), "referrer_id": ref["id"], "label": f"Referral from {(ref.get('name') or 'a friend').split(' ')[0]}"}


async def reward_referrer(booking: dict):
    """Called when a referred friend's first booking completes. Idempotent per booking."""
    ref = booking.get("referral") or {}
    if not ref.get("referrer_id") or ref.get("rewarded"):
        return
    r = await db.bookings.update_one({"id": booking["id"], "referral.rewarded": {"$ne": True}}, {"$set": {"referral.rewarded": True}})
    if not r.modified_count:
        return
    _, reward = ref_amounts(await get_settings())
    if reward <= 0:
        return
    await db.users.update_one({"id": ref["referrer_id"]}, {"$inc": {"referral_credit": reward, "referral_earned": reward}})
    await notify(ref["referrer_id"], "Referral reward earned 🎉",
                 f"Your friend completed their first trip. {rupees(reward)} off is waiting on your next booking.")


@router.get("/me/referral")
async def my_referral(user: dict = Depends(require_customer)):
    code = await ensure_code(user)
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referral_credit": 1, "referral_earned": 1})
    referred = [b async for b in db.bookings.find({"referral.referrer_id": user["id"]}, {"_id": 0, "status": 1, "referral": 1, "customer_id": 1})]
    friend, reward = ref_amounts(await get_settings())
    return {"code": code, "friend_amount": friend, "referrer_amount": reward,
            "credit": (u or {}).get("referral_credit", 0), "earned": (u or {}).get("referral_earned", 0),
            "friends_joined": len({b["customer_id"] for b in referred if b["status"] != "CANCELLED"}),
            "friends_completed": len({b["customer_id"] for b in referred if b["referral"].get("rewarded")})}


# ===================================================================== PAYOUT REQUESTS
async def driver_balance(driver_id: str) -> dict:
    earned = 0
    async for b in db.bookings.find({"driver_id": driver_id, "status": "COMPLETED"}, {"_id": 0, "driver_payout": 1, "driver_adjustment": 1, "badge_bonus": 1}):
        earned += b.get("driver_payout", 0) + b.get("driver_adjustment", 0) + b.get("badge_bonus", 0)
    paid = sum([x["amount"] async for x in db.driver_payouts.find({"driver_id": driver_id, "status": "PAID"}, {"_id": 0, "amount": 1})])
    return {"earned": earned, "paid": paid, "pending": max(earned - paid, 0)}


class PayoutRequestIn(BaseModel):
    amount: int  # paise
    note: str = ""


@router.get("/driver/payout-requests")
async def my_requests(user: dict = Depends(require_driver)):
    items = [clean(r) async for r in db.payout_requests.find({"driver_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50)]
    return {"items": items, **(await driver_balance(user["id"])), "open": next((r for r in items if r["status"] == "REQUESTED"), None)}


@router.post("/driver/payout-requests")
async def request_payout(body: PayoutRequestIn, user: dict = Depends(require_driver)):
    if await db.payout_requests.find_one({"driver_id": user["id"], "status": "REQUESTED"}, {"_id": 0, "id": 1}):
        raise HTTPException(400, "You already have a payout request waiting for approval")
    bal = await driver_balance(user["id"])
    if body.amount < 10000:
        raise HTTPException(400, "Minimum payout request is ₹100")
    if body.amount > bal["pending"]:
        raise HTTPException(400, f"You can request up to {rupees(bal['pending'])}")
    p = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "name": 1, "payout_upi": 1, "payout_bank": 1})
    method = (p or {}).get("payout_upi") or (p or {}).get("payout_bank")
    if not method:
        raise HTTPException(400, "Add your UPI ID or bank details in your driver profile first")
    doc = {"id": new_id(), "driver_id": user["id"], "driver_name": (p or {}).get("name") or user.get("name"),
           "amount": body.amount, "note": body.note.strip()[:200], "payout_method": method,
           "status": "REQUESTED", "created_at": now_iso()}
    await db.payout_requests.insert_one(dict(doc))
    async for a in db.users.find({"role": {"$in": ["owner", "super_admin", "finance"]}}, {"_id": 0, "id": 1}):
        await notify(a["id"], "Payout request", f"{doc['driver_name']} requested {rupees(body.amount)}")
    return clean(doc)


@router.get("/admin/payout-requests")
async def list_requests(status: str = "REQUESTED", user: dict = Depends(FINANCE)):
    q = {} if status == "all" else {"status": status}
    items = []
    async for r in db.payout_requests.find(q, {"_id": 0}).sort("created_at", -1).limit(100):
        items.append({**clean(r), "balance": await driver_balance(r["driver_id"])})
    return {"items": items, "open": await db.payout_requests.count_documents({"status": "REQUESTED"})}


class DecideIn(BaseModel):
    action: str  # approve | reject
    reference: str = ""
    reason: str = ""


@router.post("/admin/payout-requests/{rid}")
async def decide_request(rid: str, body: DecideIn, user: dict = Depends(FINANCE)):
    r = await db.payout_requests.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Request not found")
    if r["status"] != "REQUESTED":
        raise HTTPException(400, "This request was already handled")
    if body.action == "approve":
        bal = await driver_balance(r["driver_id"])
        if r["amount"] > bal["pending"]:
            raise HTTPException(400, f"Driver's pending balance is now {rupees(bal['pending'])}; reject and ask for a new request")
        ref = body.reference.strip() or f"REQ-{rid[:8].upper()}"
        res = await db.payout_requests.update_one({"id": rid, "status": "REQUESTED"}, {"$set": {
            "status": "APPROVED", "reference": ref, "decided_by": user.get("name"), "decided_at": now_iso()}})
        if not res.modified_count:
            raise HTTPException(400, "This request was already handled")
        pay = {"id": new_id(), "driver_id": r["driver_id"], "amount": r["amount"], "reference": ref, "status": "PAID",
               "by": user["id"], "request_id": rid, "created_at": now_iso()}
        await db.driver_payouts.insert_one(dict(pay))
        await audit(user, "payout_request_approved", "payout_request", rid, {"amount": r["amount"], "reference": ref})
        await notify(r["driver_id"], "Payout approved", f"{rupees(r['amount'])} sent to {r['payout_method']}. Ref {ref}")
        return {**r, "status": "APPROVED", "reference": ref}
    if body.action == "reject":
        if not body.reason.strip():
            raise HTTPException(400, "Add a reason so the driver knows what to fix")
        res = await db.payout_requests.update_one({"id": rid, "status": "REQUESTED"}, {"$set": {
            "status": "REJECTED", "reason": body.reason.strip()[:300], "decided_by": user.get("name"), "decided_at": now_iso()}})
        if not res.modified_count:
            raise HTTPException(400, "This request was already handled")
        await audit(user, "payout_request_rejected", "payout_request", rid, {"reason": body.reason})
        await notify(r["driver_id"], "Payout request declined", body.reason.strip()[:300])
        return {**r, "status": "REJECTED"}
    raise HTTPException(400, "Unknown action")


# ===================================================================== MONTHLY STATEMENT
def ist_day(iso: Optional[str], fallback: str) -> str:
    return (datetime.fromisoformat(iso) + IST).date().isoformat() if iso else fallback


@router.get("/driver/statements/{month}")
async def statement(month: str, user: dict = Depends(require_driver)):
    try:
        y, m = map(int, month.split("-"))
        first = datetime(y, m, 1).date()
    except Exception:
        raise HTTPException(400, "Month must look like 2026-06")
    last = first.replace(day=calendar.monthrange(y, m)[1])
    if first > (now() + IST).date() + timedelta(days=1):
        raise HTTPException(400, "Statements are available for past and current months")
    s = await get_settings()
    p = await db.driver_profiles.find_one({"user_id": user["id"]}, {"_id": 0, "name": 1, "phone": 1, "payout_upi": 1, "payout_bank": 1, "city_id": 1})
    esc = lambda v: html.escape(str(v if v is not None else ""))
    trips, opening_earned, totals = [], 0, {"base": 0, "adj": 0, "bonus": 0}
    async for b in db.bookings.find({"driver_id": user["id"], "status": "COMPLETED"}, {"_id": 0}).sort("completed_at", 1):
        day = ist_day(b.get("completed_at"), b["date"])
        amt = b.get("driver_payout", 0) + b.get("driver_adjustment", 0) + b.get("badge_bonus", 0)
        if day < first.isoformat():
            opening_earned += amt
        elif day <= last.isoformat():
            totals["base"] += b.get("driver_payout", 0)
            totals["adj"] += b.get("driver_adjustment", 0)
            totals["bonus"] += b.get("badge_bonus", 0)
            trips.append((day, b, amt))
    opening_paid, pays = 0, []
    async for x in db.driver_payouts.find({"driver_id": user["id"], "status": "PAID"}, {"_id": 0}).sort("created_at", 1):
        day = ist_day(x["created_at"], x["created_at"][:10])
        if day < first.isoformat():
            opening_paid += x["amount"]
        elif day <= last.isoformat():
            pays.append((day, x))
    month_earned = totals["base"] + totals["adj"] + totals["bonus"]
    month_paid = sum(x["amount"] for _, x in pays)
    opening = opening_earned - opening_paid
    closing = opening + month_earned - month_paid
    trip_rows = "".join(
        f"<tr><td>{esc(d)}<br><small>{esc(b['ref'])} · {esc(b['service_name'])}</small></td><td class=r>{rupees(b.get('driver_payout', 0))}</td>"
        f"<td class=r>{rupees(b.get('driver_adjustment', 0)) if b.get('driver_adjustment') else '—'}</td>"
        f"<td class=r>{rupees(b.get('badge_bonus', 0)) if b.get('badge_bonus') else '—'}</td><td class=r><b>{rupees(a)}</b></td></tr>"
        for d, b, a in trips) or "<tr><td colspan=5>No completed trips this month</td></tr>"
    pay_rows = "".join(f"<tr><td>{esc(d)}</td><td>{esc(x.get('reference'))}</td><td class=r>{rupees(x['amount'])}</td></tr>" for d, x in pays) \
        or "<tr><td colspan=3>No payouts this month</td></tr>"
    title = f"Earnings statement · {first.strftime('%B %Y')}"
    return HTMLResponse(f"""<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>{esc(title)}</title><style>
body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717;max-width:760px;margin:0 auto;padding:24px;font-size:13px}}
table{{width:100%;border-collapse:collapse}}td,th{{padding:7px 4px;border-bottom:1px solid #E5E7EB;vertical-align:top;text-align:left}}.r{{text-align:right;white-space:nowrap}}
th{{font-size:11px;color:#6B7280;text-transform:uppercase}}h1{{color:#E53935;margin:0;font-size:24px}}h2{{margin:18px 0 4px;font-size:17px}}h3{{margin:18px 0 6px;font-size:14px}}
small,.muted{{color:#6B7280}}.box{{background:#F5F5F5;border-radius:10px;padding:10px 14px;margin-top:12px}}.box tr:last-child td{{border:0}}.big td{{font-size:15px;font-weight:800}}
button{{margin-top:18px;background:#E53935;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-size:15px}}@media print{{button{{display:none}}body{{padding:0}}}}</style></head><body>
<h1>{esc(s.get('company_name', 'Prajeta'))}</h1><div class=muted>{esc(s.get('legal_name'))} · {esc(s.get('support_email'))}</div>
<h2>{esc(title)}</h2><div class=muted>{esc(first.isoformat())} to {esc(last.isoformat())} · generated {esc((now() + IST).strftime('%d %b %Y %H:%M'))} IST</div>
<table style="margin-top:10px"><tr><td>Driver</td><td class=r><b>{esc((p or {}).get('name'))}</b></td></tr><tr><td>Phone</td><td class=r>{esc((p or {}).get('phone'))}</td></tr>
<tr><td>Payout to</td><td class=r>{esc((p or {}).get('payout_upi') or (p or {}).get('payout_bank') or 'Not added')}</td></tr></table>
<div class=box><table>
<tr><td>Opening balance (unpaid)</td><td class=r id=opening>{rupees(opening)}</td></tr>
<tr><td>Fare share ({len(trips)} trips)</td><td class=r id=fare-share>{rupees(totals['base'])}</td></tr>
<tr><td>Adjustments</td><td class=r id=adjustments>{rupees(totals['adj'])}</td></tr>
<tr><td>Badge bonuses</td><td class=r id=bonuses>{rupees(totals['bonus'])}</td></tr>
<tr><td>Payouts received</td><td class=r id=payouts>-{rupees(month_paid)}</td></tr>
<tr class=big><td>Closing balance (unpaid)</td><td class=r id=closing>{rupees(closing)}</td></tr></table></div>
<h3>Trips</h3><table><tr><th>Date / trip</th><th class=r>Fare share</th><th class=r>Adjust.</th><th class=r>Bonus</th><th class=r>Total</th></tr>{trip_rows}</table>
<h3>Payouts</h3><table><tr><th>Date</th><th>Reference</th><th class=r>Amount</th></tr>{pay_rows}</table>
<p class=muted style="margin-top:18px">Amounts are your share of verified completed trips. Fuel, tolls and parking are paid by the customer directly. This is a computer-generated statement.</p>
<button onclick="window.print()">Download / Print PDF</button></body></html>""")
