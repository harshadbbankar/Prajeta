"""Idempotent seed: settings, cities, services/tariffs, demo accounts and synthetic history."""
import os
import random
from datetime import timedelta

from core import db, now, now_iso, new_id, public_ref

CITIES = [
    {"id": "mumbai", "name": "Mumbai", "state": "Maharashtra", "multiplier": 1.1, "enabled": True,
     "areas": ["Andheri", "Bandra", "Powai", "Thane", "Navi Mumbai", "South Mumbai"]},
    {"id": "pune", "name": "Pune", "state": "Maharashtra", "multiplier": 1.0, "enabled": True,
     "areas": ["Baner", "Hinjewadi", "Kothrud", "Viman Nagar", "Hadapsar"]},
    {"id": "bengaluru", "name": "Bengaluru", "state": "Karnataka", "multiplier": 1.1, "enabled": True,
     "areas": ["Whitefield", "Koramangala", "Indiranagar", "HSR Layout", "Electronic City"]},
    {"id": "delhi-ncr", "name": "Delhi NCR", "state": "Delhi", "multiplier": 1.05, "enabled": True,
     "areas": ["Gurugram", "Noida", "South Delhi", "Dwarka", "Faridabad"]},
    {"id": "hyderabad", "name": "Hyderabad", "state": "Telangana", "multiplier": 1.0, "enabled": True,
     "areas": ["Gachibowli", "HITEC City", "Banjara Hills", "Secunderabad"]},
    {"id": "chennai", "name": "Chennai", "state": "Tamil Nadu", "multiplier": 1.0, "enabled": False,
     "areas": ["T Nagar", "OMR", "Anna Nagar"]},
]

_common_terms = [
    "Customer provides a road-worthy, insured vehicle with valid documents.",
    "Fuel, tolls, parking and permits are paid by the customer.",
    "Booking is confirmed only after the 20% advance payment.",
    "Free cancellation up to 2 hours before start; a cancellation fee applies after that.",
]

SERVICES = [
    {"id": "hourly", "name": "Hourly Driver", "icon": "time-outline", "pricing_mode": "hourly",
     "tagline": "A verified driver for a few hours — errands, meetings, shopping.",
     "base_fare": 39900, "base_hours": 2, "extra_hour_rate": 15000, "night_surcharge": 20000, "min_hours": 2, "max_hours": 7},
    {"id": "full-day", "name": "Full-Day Driver", "icon": "sunny-outline", "pricing_mode": "hourly",
     "tagline": "8 to 12 hours of relaxed, professional driving in your own car.",
     "base_fare": 119900, "base_hours": 8, "extra_hour_rate": 15000, "night_surcharge": 20000, "min_hours": 8, "max_hours": 12},
    {"id": "night", "name": "Night Driver", "icon": "moon-outline", "pricing_mode": "hourly",
     "tagline": "Late parties, airport runs and overnight travel, safely home.",
     "base_fare": 79900, "base_hours": 4, "extra_hour_rate": 18000, "night_surcharge": 0, "min_hours": 4, "max_hours": 10},
    {"id": "pickup-drop", "name": "Pickup & Drop", "icon": "swap-horizontal-outline", "pricing_mode": "hourly",
     "tagline": "One-way or return trips — airport, station, hospital or office.",
     "base_fare": 49900, "base_hours": 3, "extra_hour_rate": 15000, "night_surcharge": 20000, "min_hours": 3, "max_hours": 6},
    {"id": "outstation", "name": "Outstation Driver", "icon": "map-outline", "pricing_mode": "daily",
     "tagline": "Road trips and intercity travel with an experienced highway driver.",
     "per_day": 179900, "base_hours": 12, "extra_hour_rate": 15000, "night_surcharge": 25000, "min_hours": 12, "max_hours": 12},
    {"id": "monthly", "name": "Monthly Driver", "icon": "calendar-outline", "pricing_mode": "quote",
     "tagline": "A dedicated driver every day of the month, with backup cover."},
    {"id": "permanent", "name": "Permanent Placement", "icon": "person-add-outline", "pricing_mode": "quote",
     "tagline": "We source, verify and place a full-time driver for your family."},
    {"id": "corporate", "name": "Corporate Staffing", "icon": "business-outline", "pricing_mode": "quote",
     "tagline": "Driver staffing for offices, hotels, residential societies and fleets."},
    {"id": "event-valet", "name": "Event & Valet", "icon": "sparkles-outline", "pricing_mode": "hourly",
     "tagline": "Uniformed valets and drivers for weddings, events and hotels.",
     "base_fare": 119600, "base_hours": 4, "extra_hour_rate": 29900, "night_surcharge": 20000, "min_hours": 4, "max_hours": 12},
]

FAQS = [
    {"q": "Do you provide the car?", "a": "No. Prajeta provides professional drivers for your own vehicle. We are not a taxi or rental service."},
    {"q": "How are drivers verified?", "a": "Every driver submits identity and licence documents which our verification team reviews manually, along with police/background verification status, before approval."},
    {"q": "When is my booking confirmed?", "a": "Your booking is confirmed once the 20% advance is paid online. The balance is paid after the trip."},
    {"q": "Who pays for fuel, tolls and parking?", "a": "These are paid by the customer directly and are not part of the driver fare."},
    {"q": "Can I cancel or reschedule?", "a": "Yes. Cancel free up to 2 hours before the start time. Later cancellations may attract a cancellation fee per our policy."},
    {"q": "Is there a night charge?", "a": "Trips starting between 10 PM and 6 AM carry a night surcharge, shown clearly in your fare estimate."},
]

SETTINGS = {
    "id": "main", "company_name": "Prajeta", "legal_name": "Prajeta Driver Services (to be configured)",
    "tagline": "Find a Trusted Driver, Wherever You Need One.",
    "support_phone": "+91 90000 00000", "support_email": "support@prajeta.in",
    "whatsapp_link": "https://api.whatsapp.com/message/IPGR6FOC57DXM1?autoload=1&app_absent=0",
    "business_hours": "7 AM – 11 PM, all days", "address": "India",
    "currency": "INR", "tax_rate": 18, "advance_percent": 20, "driver_share_percent": 70,
    "gateway_fee_percent": 2, "cash_enabled": True, "bookings_enabled": True,
}


async def seed():
    await db.system_settings.update_one({"id": "main"}, {"$setOnInsert": SETTINGS}, upsert=True)
    for c in CITIES:
        await db.service_areas.update_one({"id": c["id"]}, {"$setOnInsert": c}, upsert=True)
    for i, s in enumerate(SERVICES):
        doc = {**{"per_day": 0, "base_fare": 0, "base_hours": 0, "extra_hour_rate": 0, "night_surcharge": 0,
                  "min_hours": 0, "max_hours": 0}, **s,
               "terms": _common_terms, "waiting_per_hour": 10000, "cancellation_fee": 15000,
               "tariff_version": 1, "active": True, "order": i, "effective_from": "2026-01-01"}
        await db.service_categories.update_one({"id": s["id"]}, {"$setOnInsert": doc}, upsert=True)
    await db.coupons.update_one({"code": "WELCOME10"}, {"$setOnInsert": {
        "id": new_id(), "code": "WELCOME10", "percent": 10, "max_discount": 20000, "active": True}}, upsert=True)
    for name in ["Driver payouts", "Payment gateway fees", "Staff salaries", "Marketing", "Rent & utilities",
                 "Software", "Recruitment & verification", "Training", "Administration", "Other"]:
        await db.expense_categories.update_one({"name": name}, {"$setOnInsert": {"id": new_id(), "name": name}}, upsert=True)

    # Demo accounts (synthetic data, for preview/testing only)
    accounts = [
        ("+919000000001", "Owner (Demo)", "owner"),
        ("+919000000004", "Ops Manager (Demo)", "ops"),
        ("+919000000002", "Ravi Kumar (Demo Driver)", "driver"),
        ("+919000000003", "Ananya Shah (Demo Customer)", "customer"),
    ]
    for phone, name, role in accounts:
        await db.users.update_one({"phone": phone}, {"$setOnInsert": {
            "id": new_id(), "phone": phone, "name": name, "role": role, "city_id": "mumbai",
            "created_at": now_iso(), "is_demo": True}}, upsert=True)
    driver = await db.users.find_one({"phone": "+919000000002"}, {"_id": 0})
    await db.driver_profiles.update_one({"user_id": driver["id"]}, {"$setOnInsert": {
        "id": new_id(), "user_id": driver["id"], "name": driver["name"], "phone": driver["phone"],
        "address": "Andheri East, Mumbai", "city_id": "mumbai", "areas": ["Andheri", "Bandra", "Powai"],
        "experience_years": 9, "licence_number": "MH0220150012345", "licence_expiry": "2031-05-30",
        "vehicle_types": ["Hatchback", "Sedan", "SUV"], "transmissions": ["Manual", "Automatic"],
        "services": [], "availability": "Full time", "payout_upi": "ravi@upi", "consent": True,
        "police_verification": "CLEARED", "status": "APPROVED", "online": True,
        "documents": [{"id": new_id(), "doc_type": "licence", "number": "MH0220150012345", "expiry": "2031-05-30",
                       "verified": True, "path": None, "name": "licence (demo)", "uploaded_at": now_iso()},
                      {"id": new_id(), "doc_type": "identity", "number": "XXXX-XXXX-1234", "expiry": None,
                       "verified": True, "path": None, "name": "aadhaar (demo)", "uploaded_at": now_iso()}],
        "rating": 4.8, "created_at": now_iso(), "submitted_at": now_iso(), "is_demo": True}}, upsert=True)

    settings = await db.system_settings.find_one({"id": "main"}, {"_id": 0})
    if settings.get("history_seeded"):
        return
    await seed_history(driver)
    await db.system_settings.update_one({"id": "main"}, {"$set": {"history_seeded": True}})


async def seed_history(driver: dict):
    rnd = random.Random(42)
    customers = []
    for i in range(18):
        phone = f"+9180000000{i:02d}"
        uid = new_id()
        await db.users.update_one({"phone": phone}, {"$setOnInsert": {
            "id": uid, "phone": phone, "name": f"Demo Customer {i + 1}", "role": "customer",
            "city_id": rnd.choice(["mumbai", "pune", "bengaluru", "delhi-ncr", "hyderabad"]),
            "created_at": (now() - timedelta(days=rnd.randint(10, 120))).isoformat(), "is_demo": True,
            "source": rnd.choice(["Google", "Instagram", "Referral", "WhatsApp", "Walk-in"])}}, upsert=True)
        customers.append(await db.users.find_one({"phone": phone}, {"_id": 0}))
    drivers = [driver]
    for i, city in enumerate(["pune", "bengaluru", "delhi-ncr", "hyderabad", "mumbai", "bengaluru"]):
        phone = f"+9170000000{i:02d}"
        uid = new_id()
        await db.users.update_one({"phone": phone}, {"$setOnInsert": {
            "id": uid, "phone": phone, "name": f"Demo Driver {i + 1}", "role": "driver", "city_id": city,
            "created_at": now_iso(), "is_demo": True}}, upsert=True)
        u = await db.users.find_one({"phone": phone}, {"_id": 0})
        status = "APPROVED" if i < 4 else ("UNDER_REVIEW" if i == 4 else "SUBMITTED")
        await db.driver_profiles.update_one({"user_id": u["id"]}, {"$setOnInsert": {
            "id": new_id(), "user_id": u["id"], "name": u["name"], "phone": phone, "address": city.title(),
            "city_id": city, "areas": [], "experience_years": 4 + i, "licence_number": f"DL{i}2019000{i}",
            "licence_expiry": "2030-01-01", "services": [], "availability": "Full time", "consent": True,
            "police_verification": "CLEARED" if i < 4 else "PENDING", "status": status, "online": i < 3,
            "documents": [{"id": new_id(), "doc_type": "licence", "number": f"DL{i}2019000{i}", "expiry": "2030-01-01",
                           "verified": i < 4, "path": None, "name": "licence (demo)", "uploaded_at": now_iso()}],
            "rating": round(4.2 + rnd.random() * 0.7, 1), "created_at": now_iso(), "is_demo": True}}, upsert=True)
        drivers.append(u)
    svc = {s["id"]: s for s in SERVICES}
    priced = ["hourly", "full-day", "night", "pickup-drop", "outstation", "event-valet"]
    inv_no = 0
    for n in range(70):
        days_ago = rnd.randint(0, 80)
        created = now() - timedelta(days=days_ago, hours=rnd.randint(0, 20))
        sid = rnd.choice(priced)
        s = svc[sid]
        cust = rnd.choice(customers)
        d = rnd.choice(drivers)
        dprof = await db.driver_profiles.find_one({"user_id": d["id"]}, {"_id": 0})
        city = dprof["city_id"]
        sub = s.get("per_day") or (s["base_fare"] + rnd.choice([0, 0, 1, 2]) * s["extra_hour_rate"])
        tax = int(sub * 0.18)
        total = sub + tax
        adv = int(total * 0.2)
        roll = rnd.random()
        status = "COMPLETED" if roll < 0.78 else ("CANCELLED" if roll < 0.9 else "AWAITING_ASSIGNMENT")
        bid = new_id()
        paid = total if status == "COMPLETED" and rnd.random() < 0.9 else (adv if status != "CANCELLED" else 0)
        booking = {
            "id": bid, "ref": public_ref(), "customer_id": cust["id"], "customer_name": cust["name"],
            "customer_phone": cust["phone"], "service_id": sid, "service_name": s["name"], "city_id": city,
            "pickup": "Demo address", "destination": "", "date": (created + timedelta(days=1)).date().isoformat(),
            "time": "10:00", "hours": s["base_hours"], "days": 1, "vehicle_type": "Sedan", "transmission": "Manual",
            "fare": {"subtotal": sub, "discount": 0, "tax": tax, "total": total, "advance": adv, "tax_rate": 18,
                     "advance_percent": 20, "hours": s["base_hours"], "lines": [], "tariff_version": 1},
            "driver_payout": int(sub * 0.7), "status": status,
            "driver_id": d["id"] if status == "COMPLETED" else None,
            "driver_name": d["name"] if status == "COMPLETED" else None,
            "amount_paid": paid, "balance_due": max(total - paid, 0),
            "payment_status": "PAID" if paid >= total else ("ADVANCE_PAID" if paid else "PENDING"),
            "created_at": created.isoformat(), "updated_at": created.isoformat(),
            "completed_at": (created + timedelta(days=1, hours=10)).isoformat() if status == "COMPLETED" else None,
            "cancel_reason": "Plans changed" if status == "CANCELLED" else None, "is_demo": True,
            "source": cust.get("source"),
        }
        if status == "COMPLETED":
            inv_no += 1
            booking["invoice_number"] = f"PRJ-INV-{inv_no:05d}"
            await db.reviews.insert_one({"id": new_id(), "booking_id": bid, "customer_id": cust["id"],
                                         "driver_id": d["id"], "rating": rnd.choice([4, 5, 5, 5, 3]),
                                         "comment": "", "created_at": booking["completed_at"]})
            await db.booking_assignments.insert_one({"id": new_id(), "booking_id": bid, "driver_id": d["id"],
                                                     "status": "ACCEPTED", "mode": "broadcast",
                                                     "created_at": created.isoformat()})
        await db.bookings.insert_one(booking)
        if paid:
            await db.payments.insert_one({"id": new_id(), "booking_id": bid, "customer_id": cust["id"],
                                          "kind": "full" if paid >= total else "advance", "amount": paid,
                                          "currency": "INR", "method": rnd.choice(["razorpay", "razorpay", "cash"]),
                                          "status": "paid", "razorpay_order_id": None, "is_demo": True,
                                          "created_at": created.isoformat(), "paid_at": created.isoformat()})
    await db.system_settings.update_one({"id": "main"}, {"$set": {"invoice_counter": inv_no}})
    cats = ["Staff salaries", "Marketing", "Rent & utilities", "Software", "Recruitment & verification"]
    for m in range(3):
        for c in cats:
            amt = {"Staff salaries": 6000000, "Marketing": 1500000, "Rent & utilities": 2500000,
                   "Software": 300000, "Recruitment & verification": 400000}[c]
            await db.expenses.insert_one({"id": new_id(), "category": c, "amount": amt,
                                          "date": (now() - timedelta(days=30 * m + 2)).date().isoformat(),
                                          "note": "Synthetic demo expense", "is_demo": True, "created_at": now_iso()})
    # payouts recorded for the demo driver
    await db.driver_payouts.insert_one({"id": new_id(), "driver_id": driver["id"], "amount": 450000,
                                        "reference": "UPI-DEMO-0001", "status": "PAID", "is_demo": True,
                                        "created_at": (now() - timedelta(days=7)).isoformat()})
