# Iteration 6 UI setup: confirmed Mumbai booking so demo driver Ravi (fresh location) gets a wave-0 offer with distance
import json
import os
import uuid
from datetime import date, timedelta, datetime, timezone

import requests
from pymongo import MongoClient
from dotenv import dotenv_values

ENV = dotenv_values("/app/backend/.env")
BASE = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
T = json.load(open("/tmp/ui_tokens.json"))
H = lambda k: {"Authorization": f"Bearer {T[k]}"}
mdb.driver_profiles.update_one({"phone": "+919000000002"}, {"$set": {"online": True, "last_location": {
    "lat": 19.08, "lng": 72.88, "at": datetime.now(timezone.utc).isoformat()}}})
body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Bandra Kurla Complex", "time": "15:00",
        "date": (date.today() + timedelta(days=123)).isoformat(), "hours": 4, "idempotency_key": str(uuid.uuid4())}
b = requests.post(f"{BASE}/bookings", json=body, headers=H("customer")).json()
r = requests.post(f"{BASE}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"}, headers=H("owner"))
print("cash", r.status_code)
uid = mdb.users.find_one({"phone": "+919000000002"})["id"]
a = mdb.booking_assignments.find_one({"booking_id": b["id"], "driver_id": uid}, {"_id": 0})
print("ref", b["ref"], "id", b["id"], "assignment", a and {k: a[k] for k in ("wave", "distance_km", "rank", "notified", "visible_at")})
json.dump({"ref": b["ref"], "id": b["id"]}, open("/tmp/ui_offer.json", "w"))
