# Iteration 11 UI helper: advance a customer booking to IN_PROGRESS (or DRIVER_ARRIVED) for end-PIN UI checks
# usage: python tests/setup_ui_iter11.py <booking_id> [arrived|progress]
import os
import sys

import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"
ENV = dotenv_values("/app/backend/.env")
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
mdb.otp_requests.delete_many({})


def tok(phone):
    requests.post(f"{BASE}/auth/otp/send", json={"phone": phone})
    return requests.post(f"{BASE}/auth/otp/verify", json={"phone": phone, "code": "123456", "role": "customer"}).json()


bid, stage = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "progress")
o, dl, c = tok("9000000001"), tok("9000000002"), tok("9000000003")
O, D, C = ({"Authorization": f"Bearer {x['token']}"} for x in (o, dl, c))
b = requests.get(f"{BASE}/bookings/{bid}", headers=C).json()
if b["status"] == "PAYMENT_PENDING": print("cash", requests.post(f"{BASE}/admin/bookings/{bid}/cash", json={"amount": b["fare"]["advance"]}, headers=O).status_code)
print("assign", requests.post(f"{BASE}/admin/bookings/{bid}/assign", json={"driver_id": dl["user"]["id"]}, headers=O).text[:120])
offer = next((x for x in requests.get(f"{BASE}/driver/offers", headers=D).json() if x["booking_id"] == bid), None)
print("accept", requests.post(f"{BASE}/driver/offers/{offer['id']}/accept", headers=D).status_code if offer else "no offer")
print("arrive", requests.post(f"{BASE}/driver/jobs/{bid}/arrive", headers=D).status_code)
cb = requests.get(f"{BASE}/bookings/{bid}", headers=C).json()
if stage == "progress":
    print("start", requests.post(f"{BASE}/driver/jobs/{bid}/start", json={"otp": cb["trip_otp"]}, headers=D).status_code)
print("END_OTP", cb.get("end_otp"), "TRIP_OTP", cb.get("trip_otp"))
