# Iteration 5 UI setup: tokens for roles + a fresh confirmed (unshared) booking + ended share token
import json
import os
import uuid
from datetime import date, timedelta

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

ENV = dotenv_values("/app/backend/.env")
BASE = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"
db = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
db.otp_requests.delete_many({})


def login(phone):
    requests.post(f"{BASE}/auth/otp/send", json={"phone": phone})
    return requests.post(f"{BASE}/auth/otp/verify", json={"phone": phone, "code": "123456"}).json()["token"]


t = {k: login(p) for k, p in {"owner": "9000000001", "driver": "9000000002", "customer": "9000000003", "ops": "9000000004"}.items()}
db.otp_requests.delete_many({})
H = lambda k: {"Authorization": f"Bearer {t[k]}"}  # noqa: E731
b = requests.post(f"{BASE}/bookings", headers=H("customer"), json={
    "service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ UI Bandra West", "date": (date.today() + timedelta(days=6)).isoformat(),
    "time": "09:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}).json()
requests.post(f"{BASE}/admin/bookings/{b['id']}/cash", headers=H("owner"), json={"amount": b["fare"]["advance"], "reference": "TEST"})
ended = db.bookings.find_one({"status": "COMPLETED", "share_token": {"$exists": True}}, {"share_token": 1})
print(json.dumps({**t, "booking": b["id"], "ref": b["ref"], "ended_token": ended and ended["share_token"]}))
