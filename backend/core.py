"""Shared core: DB, auth, helpers, object storage."""
import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Annotated, Any

import jwt
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("prajeta")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_DAYS = 30

ADMIN_ROLES = ["owner", "super_admin", "ops", "verification", "support", "finance"]


# ---------------------------------------------------------------- Mongo models
PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    """Base for documents. We use a string `id` (uuid) as public id and never return `_id`."""
    model_config = ConfigDict(extra="allow", populate_by_name=True)
    id: PyObjectId = Field(default_factory=lambda: str(uuid.uuid4()))

    def to_mongo(self) -> dict:
        return self.model_dump()

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if not doc:
            return None
        doc = dict(doc)
        doc.pop("_id", None)
        return cls(**doc)


def clean(doc: Optional[dict]) -> Optional[dict]:
    """Strip Mongo _id from a raw document."""
    if doc is None:
        return None
    return BaseDocument.from_mongo(doc).model_dump()


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def public_ref(prefix: str = "PRJ") -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return prefix + "-" + "".join(secrets.choice(alphabet) for _ in range(8))


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 10:
        digits = "91" + digits
    if len(digits) != 12 or not digits.startswith("91"):
        raise HTTPException(400, "Enter a valid 10-digit Indian mobile number")
    return "+" + digits


def rupees(paise: int) -> str:
    return f"₹{paise / 100:,.2f}"


# ---------------------------------------------------------------- auth
def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now() + timedelta(days=JWT_DAYS), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def user_from_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid session")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("restricted"):
        raise HTTPException(403, "Your account is restricted. Please contact support.")
    return user


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    return await user_from_token(token)


def require_roles(*roles: str):
    async def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return dep


require_customer = require_roles("customer", "corporate")
require_driver = require_roles("driver")
require_admin = require_roles(*ADMIN_ROLES)


async def audit(actor: dict, action: str, entity: str, entity_id: str, details: Any = None):
    await db.audit_logs.insert_one({
        "id": new_id(), "actor_id": actor.get("id"), "actor_name": actor.get("name") or actor.get("phone"),
        "actor_role": actor.get("role"), "action": action, "entity": entity, "entity_id": entity_id,
        "details": details, "created_at": now_iso(),
    })


async def notify(user_id: Optional[str], title: str, body: str, booking_id: Optional[str] = None):
    if not user_id:
        return
    await db.notifications.insert_one({
        "id": new_id(), "user_id": user_id, "title": title, "body": body,
        "booking_id": booking_id, "read": False, "created_at": now_iso(),
    })


async def notify_admins(title: str, body: str, booking_id: Optional[str] = None):
    async for a in db.users.find({"role": {"$in": ["owner", "super_admin", "ops"]}}, {"_id": 0, "id": 1}):
        await notify(a["id"], title, body, booking_id)


async def get_settings() -> dict:
    s = await db.system_settings.find_one({"id": "main"}, {"_id": 0})
    return s or {}


# ---------------------------------------------------------------- object storage
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "prajeta"
_storage_key: Optional[str] = None


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 503:
        _storage_key = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    if resp.status_code == 402:
        raise HTTPException(402, "Storage credits exhausted. Please try again later.")
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------- periods
def period_range(period: str, start: Optional[str] = None, end: Optional[str] = None):
    """Return (start_dt, end_dt, prev_start, prev_end) in UTC for a period key."""
    t = now()
    today = t.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "custom" and start and end:
        s = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        e = datetime.fromisoformat(end).replace(tzinfo=timezone.utc) + timedelta(days=1)
    elif period == "today":
        s, e = today, today + timedelta(days=1)
    elif period == "yesterday":
        s, e = today - timedelta(days=1), today
    elif period == "week":
        s = today - timedelta(days=today.weekday()); e = s + timedelta(days=7)
    elif period == "prev_week":
        e = today - timedelta(days=today.weekday()); s = e - timedelta(days=7)
    elif period == "month":
        s = today.replace(day=1); e = (s + timedelta(days=32)).replace(day=1)
    elif period == "prev_month":
        e = today.replace(day=1); s = (e - timedelta(days=1)).replace(day=1)
    elif period == "quarter":
        qm = ((today.month - 1) // 3) * 3 + 1
        s = today.replace(month=qm, day=1); e = (s + timedelta(days=95)).replace(day=1)
    elif period == "fy":
        y = today.year if today.month >= 4 else today.year - 1
        s = today.replace(year=y, month=4, day=1); e = s.replace(year=y + 1)
    elif period == "30d":
        s, e = today - timedelta(days=29), today + timedelta(days=1)
    elif period == "7d":
        s, e = today - timedelta(days=6), today + timedelta(days=1)
    else:  # all
        s, e = datetime(2020, 1, 1, tzinfo=timezone.utc), today + timedelta(days=1)
    span = e - s
    return s, e, s - span, s
