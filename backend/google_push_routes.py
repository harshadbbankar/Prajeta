"""Emergent managed Google sign-in (customers & drivers), add-mobile-number flow, and push notification relay."""
import asyncio
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError

from core import db, now_iso, new_id, normalize_phone, get_current_user, make_token, logger

router = APIRouter(prefix="/api")
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ===================================================================== GOOGLE SIGN-IN
class SessionIn(BaseModel):
    session_id: str
    role: str = "customer"  # customer | driver (new accounts only)


@router.post("/auth/session")
async def google_session(body: SessionIn):
    if not body.session_id.strip():
        raise HTTPException(401, "Missing session")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id.strip()})
    except Exception as e:
        logger.error("Google session exchange failed: %s", e)
        raise HTTPException(502, "Google sign-in is unavailable right now. Try phone login.")
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in expired. Please try again.")
    data = r.json()
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Google account has no email")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        if user["role"] not in ("customer", "corporate", "driver"):
            raise HTTPException(403, "Staff accounts sign in with their mobile number.")
        if user.get("restricted"):
            raise HTTPException(403, "Your account is restricted. Please contact support.")
        upd = {"google": True, "picture": data.get("picture")}
        if not user.get("name") and data.get("name"):
            upd["name"] = data["name"]
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
        user.update(upd)
    else:
        role = body.role if body.role in ("customer", "driver") else "customer"
        user = {"id": new_id(), "phone": None, "email": email, "name": data.get("name") or "", "role": role,
                "city_id": None, "picture": data.get("picture"), "google": True, "created_at": now_iso(),
                "source": "google"}
        await db.users.insert_one(dict(user))
    return {"session_token": make_token(user["id"]), "token": make_token(user["id"]), "user": user}


# ===================================================================== ADD / CHANGE MOBILE NUMBER
class PhoneIn(BaseModel):
    phone: str
    code: str


@router.post("/auth/phone/verify")
async def add_phone(body: PhoneIn, user: dict = Depends(get_current_user)):
    from server import check_code  # OTP verification lives with the phone login
    phone = normalize_phone(body.phone)
    if not await check_code(phone, body.code.strip()):
        raise HTTPException(400, "Incorrect or expired code")
    other = await db.users.find_one({"phone": phone, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
    if other:
        raise HTTPException(409, "This number already has a Prajeta account. Log in with the number instead.")
    try:
        await db.users.update_one({"id": user["id"]}, {"$set": {"phone": phone}})
    except DuplicateKeyError:
        raise HTTPException(409, "This number already has a Prajeta account. Log in with the number instead.")
    await db.driver_profiles.update_one({"user_id": user["id"]}, {"$set": {"phone": phone}})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0})


# ===================================================================== PUSH NOTIFICATIONS (Emergent relay)
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str   # "android" | "ios"
    device_token: str


@router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody, user: dict = Depends(get_current_user)):
    if body.user_id != user["id"]:
        raise HTTPException(403, "Cannot register push for another user")
    if body.platform not in ("android", "ios"):
        raise HTTPException(400, "Unsupported platform")
    resp = await _client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    if resp.status_code >= 400:
        logger.warning("Push register rejected (%s): %s", resp.status_code, resp.text[:200])
        raise HTTPException(400, "Could not register this device for notifications")
    return {"status": "registered"}


async def send_push(recipients: list[str], data: dict, idempotency_key: Optional[str] = None, _attempt: int = 0) -> None:
    recipients = [r for r in recipients if r]
    if not recipients:
        return
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per /trigger call; chunk before sending")
    if "title" not in data or "message" not in data:
        raise ValueError("data must include title and message")
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await _client.post("/api/v1/push/trigger", json=payload)
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    code = resp.json().get("code", "") if resp.headers.get("content-type", "").startswith("application/json") else ""
    if code == "idempotency_key_in_progress" and idempotency_key and _attempt < 3:
        await asyncio.sleep(3)
        return await send_push(recipients, data, idempotency_key=idempotency_key, _attempt=_attempt + 1)
    if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
        logger.warning(f"Push paused: {code} ({resp.status_code}): {resp.json().get('message', '')}")
        return
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()


async def push_for_notification(user_id: str, title: str, body: str, booking_id: Optional[str], notif_id: str):
    """Mirror an in-app notification as a phone push. Never raises."""
    try:
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
        role = (u or {}).get("role")
        if booking_id:
            url = "/trip/" + booking_id if role == "driver" else "/booking/" + booking_id if role in ("customer", "corporate") else "/erp/booking/" + booking_id
        else:
            url = "/notifications"
        await send_push([user_id], {"title": title, "message": body, "action_url": url}, idempotency_key=notif_id)
    except Exception as e:
        logger.warning(f"Push failed (non-blocking): {e}")
