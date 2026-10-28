# Iteration 12 UI helper: create a Mumbai booking (with a TEST_ garage vehicle) and offer it to the demo driver
# usage: python tests/setup_ui_iter12.py
import os
import random
import uuid
from datetime import date, timedelta

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"
ENV = dotenv_values("/app/backend/.env")
MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]].otp_requests.delete_many({})


def tok(phone):
    requests.post(f"{BASE}/auth/otp/send", json={"phone": phone})
    return requests.post(f"{BASE}/auth/otp/verify", json={"phone": phone, "code": "123456", "role": "customer"}).json()


o, dl, c = tok("9000000001"), tok("9000000002"), tok("9000000003")
O, D, C = ({"Authorization": f"Bearer {x['token']}"} for x in (o, dl, c))
v = requests.post(f"{BASE}/me/vehicles", json={"reg_number": f"MH02UI{random.randint(5000, 9999)}", "make": "TEST_Toyota", "model": "Fortuner",
                                              "body_type": "SUV", "transmission": "Automatic", "color": "Black"}, headers=C).json()
b = requests.post(f"{BASE}/bookings", json={"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Juhu, Mumbai",
                                            "date": (date.today() + timedelta(days=random.randint(20, 60))).isoformat(), "time": "10:00",
                                            "hours": 4, "vehicle_id": v.get("id"), "idempotency_key": str(uuid.uuid4())}, headers=C).json()
print("cash", requests.post(f"{BASE}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=O).status_code)
print("assign", requests.post(f"{BASE}/admin/bookings/{b['id']}/assign", json={"driver_id": dl["user"]["id"]}, headers=O).text[:100])
offer = next((x for x in requests.get(f"{BASE}/driver/offers", headers=D).json() if x["booking_id"] == b["id"]), None)
print("BOOKING", b["id"], b["ref"], "OFFER", offer and offer["id"], "VEHICLE", offer and offer["booking"].get("vehicle"))
