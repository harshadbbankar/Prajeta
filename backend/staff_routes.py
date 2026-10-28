"""ERP staff management and licence-expiry monitoring."""
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, now_iso, new_id, normalize_phone, require_roles, audit, notify, period_range, ADMIN_ROLES
from licence import licence_check, days_left

router = APIRouter(prefix="/api/admin")
SUPER = require_roles("owner", "super_admin")
VERIFY = require_roles("owner", "super_admin", "ops", "verification")
STAFF_ROLES = ["super_admin", "ops", "verification", "support", "finance"]


class StaffIn(BaseModel):
    name: str
    phone: str
    role: str


class StaffUpdate(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None
    name: Optional[str] = None


def allowed_role(actor: dict, role: str):
    if role not in STAFF_ROLES:
        raise HTTPException(400, "Choose a valid staff role")
    if role == "super_admin" and actor["role"] != "owner":
        raise HTTPException(403, "Only the owner can create a Super Admin")


@router.get("/staff")
async def list_staff(user: dict = Depends(SUPER)):
    return [u async for u in db.users.find({"role": {"$in": ADMIN_ROLES}}, {"_id": 0}).sort("created_at", 1)]


@router.post("/staff")
async def create_staff(body: StaffIn, user: dict = Depends(SUPER)):
    allowed_role(user, body.role)
    if not body.name.strip():
        raise HTTPException(400, "Enter the staff member's name")
    phone = normalize_phone(body.phone)
    existing = await db.users.find_one({"phone": phone}, {"_id": 0})
    if existing:
        raise HTTPException(400, f"This number is already registered as {existing['role']}. Use a different number.")
    doc = {"id": new_id(), "phone": phone, "name": body.name.strip(), "role": body.role, "created_at": now_iso(),
           "created_by": user["id"], "source": "staff"}
    await db.users.insert_one(dict(doc))
    await audit(user, "staff_created", "user", doc["id"], {"role": body.role, "phone": phone})
    return doc


@router.put("/staff/{uid}")
async def update_staff(uid: str, body: StaffUpdate, user: dict = Depends(SUPER)):
    target = await db.users.find_one({"id": uid, "role": {"$in": ADMIN_ROLES}}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Staff member not found")
    if target["id"] == user["id"]:
        raise HTTPException(400, "You cannot change your own access")
    if target["role"] == "owner" or (target["role"] == "super_admin" and user["role"] != "owner"):
        raise HTTPException(403, "You cannot change this account")
    upd = {}
    if body.role:
        allowed_role(user, body.role)
        upd["role"] = body.role
    if body.active is not None:
        upd["restricted"] = not body.active
    if body.name:
        upd["name"] = body.name.strip()
    await db.users.update_one({"id": uid}, {"$set": upd})
    await audit(user, "staff_updated", "user", uid, upd)
    if "role" in upd:
        await notify(uid, "Your access changed", f"Your ERP role is now {upd['role'].replace('_', ' ')}.")
    return await db.users.find_one({"id": uid}, {"_id": 0})


@router.get("/licences")
async def licences(user: dict = Depends(VERIFY)):
    await licence_check()
    out = []
    async for p in db.driver_profiles.find({"status": {"$ne": "DRAFT"}}, {"_id": 0}):
        base = {"user_id": p["user_id"], "name": p.get("name"), "phone": p["phone"], "city_id": p.get("city_id"),
                "status": p["status"]}
        for d in p.get("documents", []):
            if d.get("doc_type") in ("identity", "police_verification", "address_proof") and (d.get("expiry") or d["doc_type"] in p.get("docs_expired", [])):
                left = days_left(d["expiry"]) if d.get("expiry") else None
                paused_doc = d["doc_type"] in p.get("docs_expired", [])
                if paused_doc or (left is not None and left <= 60):
                    out.append({**base, "doc_type": d["doc_type"], "licence_expiry": d.get("expiry") or "", "days_left": left if left is not None else -1,
                                "paused": paused_doc, "renewal_uploaded": paused_doc and not d.get("verified"),
                                "renewal_expiry": d.get("expiry") if paused_doc and not d.get("verified") else None})
        if not p.get("licence_expiry"):
            continue
        left = days_left(p["licence_expiry"])
        if left is None or left > 60:
            continue
        renewal = next((d for d in p.get("documents", []) if d["doc_type"] == "licence_renewal"), None)
        out.append({**base, "doc_type": "licence",
                    "licence_expiry": p["licence_expiry"], "days_left": left,
                    "paused": bool(p.get("licence_expired")), "renewal_uploaded": bool(renewal),
                    "renewal_expiry": (renewal or {}).get("expiry")})
    return sorted(out, key=lambda x: x["days_left"])


@router.post("/licences/run-check")
async def run_check(user: dict = Depends(VERIFY)):
    return await licence_check()


def _avg(xs):
    return round(sum(xs) / len(xs), 1) if xs else None


def _minutes(a: str, b: str):
    try:
        return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60
    except Exception:
        return None


@router.get("/staff/performance")
async def staff_performance(period: str = "30d", user: dict = Depends(SUPER)):
    """Per-staff productivity from audit logs, tickets and dispatch timestamps."""
    s, e, _, _ = period_range(period)
    since, until = s.isoformat(), e.isoformat()
    staff = {u["id"]: {"id": u["id"], "name": u.get("name") or u["phone"], "role": u["role"], "phone": u["phone"],
                       "tickets_handled": 0, "tickets_resolved": 0, "replies": 0, "response_mins": [],
                       "approvals": 0, "rejections": 0, "docs_verified": 0, "assignments": 0, "dispatch_mins": [],
                       "quotes": 0, "exceptions": 0, "finance_actions": 0}
             async for u in db.users.find({"role": {"$in": ADMIN_ROLES}}, {"_id": 0})}
    async for a in db.audit_logs.find({"created_at": {"$gte": since, "$lt": until}}, {"_id": 0}):
        st = staff.get(a.get("actor_id"))
        if not st:
            continue
        act = a["action"]
        if act == "driver_approved":
            st["approvals"] += 1
        elif act in ("driver_rejected", "driver_suspended"):
            st["rejections"] += 1
        elif act == "document_verified":
            st["docs_verified"] += 1
        elif act == "booking_assign":
            st["assignments"] += 1
            b = await db.bookings.find_one({"id": a["entity_id"]}, {"_id": 0, "confirmed_at": 1})
            m = _minutes((b or {}).get("confirmed_at") or "", a["created_at"])
            if m is not None and m >= 0:
                st["dispatch_mins"].append(m)
        elif act == "booking_quote":
            st["quotes"] += 1
        elif act == "booking_status":
            st["exceptions"] += 1
        elif act == "ticket_status" and (a.get("details") or {}).get("status") == "resolved":
            st["tickets_resolved"] += 1
        elif act in ("refund", "cash_recorded", "payout_recorded", "expense_added", "fare_adjustment"):
            st["finance_actions"] += 1
    async for t in db.support_tickets.find({"updated_at": {"$gte": since}, "created_at": {"$lt": until}}, {"_id": 0}):
        first_by = None
        for m in t.get("messages", []):
            if m.get("by") != "support":
                continue
            sid = m.get("by_id") or next((k for k, v in staff.items() if v["name"] == m.get("name")), None)
            if sid in staff:
                staff[sid]["replies"] += 1
                if first_by is None:
                    first_by = sid
                    mins = _minutes(t["created_at"], m["at"])
                    if mins is not None and mins >= 0:
                        staff[sid]["response_mins"].append(mins)
        owner = t.get("assigned_to_id") or first_by
        if owner in staff:
            staff[owner]["tickets_handled"] += 1
    out = []
    for st in staff.values():
        st["avg_first_response_mins"] = _avg(st.pop("response_mins"))
        st["avg_dispatch_mins"] = _avg(st.pop("dispatch_mins"))
        st["score"] = (st["tickets_resolved"] * 3 + st["tickets_handled"] + st["approvals"] * 3 + st["docs_verified"]
                       + st["assignments"] * 2 + st["quotes"] * 2 + st["finance_actions"])
        out.append(st)
    return {"period_start": since, "period_end": until, "staff": sorted(out, key=lambda x: -x["score"]),
            "score_formula": "3×resolved tickets + handled tickets + 3×driver approvals + documents verified + 2×dispatches + 2×quotes + finance actions"}
