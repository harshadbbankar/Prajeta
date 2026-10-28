# Iteration 12: GET /api/driver/offers booking brief includes garage 'vehicle' snapshot (and nothing sensitive)
import os
import random
import uuid
from datetime import date, timedelta

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
ENV = dotenv_values("/app/backend/.env")
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]


def login(phone):
    requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": "123456", "role": "customer"})
    assert r.status_code == 200, r.text
    return r.json()


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctx():
    mdb.otp_requests.delete_many({})
    o, d, c = login("9000000001"), login("9000000002"), login("9000000003")
    out = {"O": H(o["token"]), "D": H(d["token"]), "C": H(c["token"]), "driver_id": d["user"]["id"], "bids": []}
    yield out
    mdb.vehicles.delete_many({"user_id": c["user"]["id"], "make": {"$regex": "^TEST_"}})
    for bid in out["bids"]:
        requests.post(f"{BASE_URL}/bookings/{bid}/cancel", json={"reason": "TEST cleanup"}, headers=out["C"])


def _book_and_offer(ctx, **extra):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Colaba, Mumbai",
            "date": (date.today() + timedelta(days=random.randint(40, 300))).isoformat(),
            "time": f"{random.randint(7, 19):02d}:00", "hours": 4, "idempotency_key": str(uuid.uuid4()), **extra}
    b = requests.post(f"{BASE_URL}/bookings", json=body, headers=ctx["C"]).json()
    ctx["bids"].append(b["id"])
    assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=ctx["O"]).status_code == 200
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": ctx["driver_id"]}, headers=ctx["O"])
    assert r.status_code == 200, r.text
    offers = requests.get(f"{BASE_URL}/driver/offers", headers=ctx["D"]).json()
    return next(x for x in offers if x["booking_id"] == b["id"])


def test_offer_includes_vehicle(ctx):
    v = requests.post(f"{BASE_URL}/me/vehicles", json={"reg_number": f"MH04TT{random.randint(1000, 9999)}", "make": "TEST_Hyundai",
                                                      "model": "Creta", "body_type": "SUV", "transmission": "Automatic", "color": "White"},
                      headers=ctx["C"]).json()
    offer = _book_and_offer(ctx, vehicle_id=v["id"])
    veh = offer["booking"].get("vehicle")
    assert veh is not None
    assert set(veh.keys()) == {"make", "model", "reg_number", "body_type", "transmission", "color"}
    assert veh["make"] == "TEST_Hyundai" and veh["model"] == "Creta" and veh["reg_number"] == v["reg_number"]
    assert veh["color"] == "White" and veh["transmission"] == "Automatic"
    assert "end_otp" not in str(offer) and "trip_otp" not in str(offer)


def test_offer_without_vehicle_has_no_vehicle_key(ctx):
    offer = _book_and_offer(ctx)
    assert "vehicle" not in offer["booking"] or not offer["booking"]["vehicle"]
