"""Customer vehicle garage + GST billing profile (Executive Chauffeur Platform v2.4)."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, now_iso, new_id, require_customer

router = APIRouter(prefix="/api")
TRANSMISSIONS = ("Manual", "Automatic", "DCT", "EV")
BODY_TYPES = ("Hatchback", "Sedan", "SUV", "MUV", "Luxury", "EV")
GSTIN_RE = re.compile(r"^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


class VehicleIn(BaseModel):
    reg_number: str
    make: str
    model: str
    body_type: str = "Sedan"
    transmission: str = "Manual"
    fuel: str = ""
    color: str = ""
    insurance_expiry: Optional[str] = None
    fastag: bool = False


@router.get("/me/vehicles")
async def list_vehicles(user: dict = Depends(require_customer)):
    return {"items": [v async for v in db.vehicles.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1)]}


@router.post("/me/vehicles")
async def add_vehicle(body: VehicleIn, user: dict = Depends(require_customer)):
    reg = re.sub(r"[\s-]", "", body.reg_number.upper())
    if not re.fullmatch(r"[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}|\d{2}BH\d{4}[A-Z]{1,2}", reg):
        raise HTTPException(400, "Enter a valid Indian registration number, e.g. MH01AB1234")
    if body.transmission not in TRANSMISSIONS or body.body_type not in BODY_TYPES:
        raise HTTPException(400, "Choose a valid body type and transmission")
    if not body.make.strip() or not body.model.strip():
        raise HTTPException(400, "Make and model are required")
    if await db.vehicles.count_documents({"user_id": user["id"]}) >= 10:
        raise HTTPException(400, "You can save up to 10 vehicles")
    if await db.vehicles.find_one({"user_id": user["id"], "reg_number": reg}, {"_id": 0, "id": 1}):
        raise HTTPException(409, "This vehicle is already in your garage")
    v = {"id": new_id(), "user_id": user["id"], "reg_number": reg, "make": body.make.strip()[:40], "model": body.model.strip()[:40],
         "body_type": body.body_type, "transmission": body.transmission, "fuel": body.fuel.strip()[:20],
         "color": body.color.strip()[:20], "insurance_expiry": body.insurance_expiry or None, "fastag": body.fastag,
         "created_at": now_iso()}
    await db.vehicles.insert_one(dict(v))
    return v


@router.delete("/me/vehicles/{vid}")
async def delete_vehicle(vid: str, user: dict = Depends(require_customer)):
    r = await db.vehicles.delete_one({"id": vid, "user_id": user["id"]})
    if not r.deleted_count:
        raise HTTPException(404, "Vehicle not found")
    return {"ok": True}


class BillingIn(BaseModel):
    company_name: str = ""
    gstin: str = ""
    address: str = ""


@router.get("/me/billing")
async def get_billing(user: dict = Depends(require_customer)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "billing": 1})
    return {"billing": (u or {}).get("billing")}


@router.put("/me/billing")
async def put_billing(body: BillingIn, user: dict = Depends(require_customer)):
    gstin = body.gstin.strip().upper()
    if not gstin:  # clearing the GST profile
        await db.users.update_one({"id": user["id"]}, {"$unset": {"billing": ""}})
        return {"billing": None}
    if not GSTIN_RE.fullmatch(gstin):
        raise HTTPException(400, "Enter a valid 15-character GSTIN")
    if not body.company_name.strip():
        raise HTTPException(400, "Company name is required for GST invoices")
    billing = {"company_name": body.company_name.strip()[:100], "gstin": gstin, "address": body.address.strip()[:250]}
    await db.users.update_one({"id": user["id"]}, {"$set": {"billing": billing}})
    return {"billing": billing}


async def vehicle_snapshot(user_id: str, vehicle_id: Optional[str]) -> Optional[dict]:
    if not vehicle_id:
        return None
    v = await db.vehicles.find_one({"id": vehicle_id, "user_id": user_id}, {"_id": 0, "user_id": 0})
    if not v:
        raise HTTPException(400, "Selected vehicle not found in your garage")
    return v
