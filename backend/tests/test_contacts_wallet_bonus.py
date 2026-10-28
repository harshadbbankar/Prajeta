# Iteration 7: Trusted contacts, SOS share_token+contacts, badge bonus on completion, ERP badge settings, driver wallet
import os
import random
import uuid
from datetime import date, timedelta

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

ENV = dotenv_values("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
CUST_PHONE = "+919000000003"


def login(phone, role="customer"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or "123456"
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": code, "role": role})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def toks():
    mdb.otp_requests.delete_many({})
    t = {k: login(p)["token"] for k, p in
         {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003"}.items()}
    mdb.otp_requests.delete_many({})
    return t


@pytest.fixture(scope="module")
def saved_contacts():
    u = mdb.users.find_one({"phone": CUST_PHONE})
    orig = u.get("trusted_contacts")
    yield orig
    mdb.users.update_one({"phone": CUST_PHONE}, {"$set": {"trusted_contacts": orig or []}})


def new_booking(toks):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Gateway of India, Colaba",
            "date": (date.today() + timedelta(days=random.randint(40, 300))).isoformat(),
            "time": f"{random.randint(6, 20):02d}:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}
    r = requests.post(f"{BASE_URL}/bookings", json=body, headers=H(toks["customer"]))
    assert r.status_code == 200, r.text
    return r.json()


def to_accepted(toks, b):
    o, d = H(toks["owner"]), H(toks["driver"])
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"}, headers=o)
    assert r.status_code == 200, r.text
    uid = requests.get(f"{BASE_URL}/auth/me", headers=d).json()["id"]
    mdb.booking_assignments.update_many({"booking_id": b["id"], "driver_id": uid}, {"$set": {"visible_at": "2000-01-01T00:00:00+00:00"}})
    mine = [x for x in requests.get(f"{BASE_URL}/driver/offers", headers=d).json() if x["booking_id"] == b["id"]]
    if not mine:
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": uid}, headers=o)
        mine = [x for x in requests.get(f"{BASE_URL}/driver/offers", headers=d).json() if x["booking_id"] == b["id"]]
    assert mine, "no offer for demo driver"
    acc = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
    assert acc.status_code == 200, acc.text
    return uid


def run_to_complete(toks, b):
    d = H(toks["driver"])
    assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", json={}, headers=d).status_code == 200
    otp = mdb.bookings.find_one({"id": b["id"]})["trip_otp"]
    r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d)
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"cash_collected": False, "end_pin": (__import__("pymongo").MongoClient(__import__("dotenv").dotenv_values("/app/backend/.env")["MONGO_URL"])[__import__("dotenv").dotenv_values("/app/backend/.env")["DB_NAME"]].bookings.find_one({"id": b['id']}) or {}).get("end_otp", "")}, headers=d)
    assert r.status_code == 200, r.text
    return mdb.bookings.find_one({"id": b["id"]}, {"_id": 0})


# ---------------- Trusted contacts ----------------
class TestContacts:
    def test_get_contacts_customer(self, toks, saved_contacts):
        r = requests.get(f"{BASE_URL}/me/contacts", headers=H(toks["customer"]))
        assert r.status_code == 200 and isinstance(r.json()["contacts"], list)

    def test_non_customer_403(self, toks):
        for k in ("driver", "owner", "ops"):
            assert requests.get(f"{BASE_URL}/me/contacts", headers=H(toks[k])).status_code == 403, k
            assert requests.put(f"{BASE_URL}/me/contacts", json={"contacts": []}, headers=H(toks[k])).status_code == 403, k

    def test_normalise_and_dedupe(self, toks, saved_contacts):
        body = {"contacts": [{"name": " TEST_A ", "phone": "98765 43210", "relation": "Parent"},
                             {"name": "TEST_B", "phone": "+91 9123456780"},
                             {"name": "TEST_C", "phone": "08123456789"},
                             {"name": "TEST_Dup", "phone": "+919876543210"}]}
        r = requests.put(f"{BASE_URL}/me/contacts", json=body, headers=H(toks["customer"]))
        assert r.status_code == 200, r.text
        c = r.json()["contacts"]
        assert [x["phone"] for x in c] == ["+919876543210", "+919123456780", "+918123456789"]
        assert c[0]["name"] == "TEST_A" and c[0]["relation"] == "Parent"
        g = requests.get(f"{BASE_URL}/me/contacts", headers=H(toks["customer"])).json()["contacts"]
        assert g == c

    def test_validation(self, toks, saved_contacts):
        h = H(toks["customer"])
        cases = [
            [{"name": f"TEST_{i}", "phone": f"98765432{i:02d}"} for i in range(6)],  # >5
            [{"name": "  ", "phone": "9876543210"}],  # no name
            [{"name": "TEST_X", "phone": "12345"}],  # invalid
            [{"name": "TEST_X", "phone": "5123456789"}],  # bad prefix
            [{"name": "TEST_Me", "phone": "9000000003"}],  # self
        ]
        for c in cases:
            r = requests.put(f"{BASE_URL}/me/contacts", json={"contacts": c}, headers=h)
            assert r.status_code == 400, f"{c}: {r.status_code} {r.text}"

    def test_restore_mom(self, toks, saved_contacts):
        r = requests.put(f"{BASE_URL}/me/contacts", json={"contacts": [{"name": "TEST_Mom", "phone": "+919876543210", "relation": "Parent"}]},
                         headers=H(toks["customer"]))
        assert r.status_code == 200 and len(r.json()["contacts"]) == 1


# ---------------- ERP badge bonus settings ----------------
class TestSettings:
    def test_valid_and_invalid(self, toks):
        o = H(toks["owner"])
        orig = requests.get(f"{BASE_URL}/admin/settings", headers=o).json()
        for bad in ({"badge_bonus_top": -1}, {"badge_bonus_gold": 5001}, {"badge_bonus_top": "abc"}, {"badge_bonus_gold": None}):
            r = requests.put(f"{BASE_URL}/admin/settings", json=bad, headers=o)
            assert r.status_code == 400, f"{bad}: {r.status_code}"
        r = requests.put(f"{BASE_URL}/admin/settings", json={"badge_bonus_top": 75, "badge_bonus_gold": "150"}, headers=o)
        assert r.status_code == 200, r.text
        assert r.json()["badge_bonus_top"] == 75 and r.json()["badge_bonus_gold"] == 150
        er = requests.get(f"{BASE_URL}/driver/earnings", headers=H(toks["driver"])).json()
        assert er["bonus_rates"] == {"top": 7500, "gold": 15000}
        r = requests.put(f"{BASE_URL}/admin/settings", json={"badge_bonus_top": orig.get("badge_bonus_top", 50),
                                                              "badge_bonus_gold": orig.get("badge_bonus_gold", 100)}, headers=o)
        assert r.status_code == 200

    def test_ops_cannot_edit(self, toks):
        r = requests.put(f"{BASE_URL}/admin/settings", json={"badge_bonus_top": 10}, headers=H(toks["ops"]))
        assert r.status_code == 403


# ---------------- Wallet ----------------
class TestWallet:
    def test_shape(self, toks):
        r = requests.get(f"{BASE_URL}/driver/earnings", headers=H(toks["driver"]))
        assert r.status_code == 200, r.text
        e = r.json()
        for k in ("total_earned", "pending", "total_paid", "bonus_total", "periods", "daily", "items", "payouts", "badge", "bonus_rates", "payout_method"):
            assert k in e, k
        assert set(e["periods"]) == {"today", "week", "month"}
        assert len(e["daily"]) == 14 and all(set(d) == {"date", "amount", "trips"} for d in e["daily"])
        assert e["daily"][-1]["date"] > e["daily"][0]["date"]
        assert e["total_earned"] == sum(i["amount"] for i in e["items"])
        for i in e["items"]:
            assert i["amount"] == i["base"] + i["adjustment"] + i["bonus"]
        assert e["pending"] == max(e["total_earned"] - e["total_paid"], 0)

    def test_customer_forbidden(self, toks):
        assert requests.get(f"{BASE_URL}/driver/earnings", headers=H(toks["customer"])).status_code == 403


# ---------------- SOS returns share_token + contacts ----------------
class TestSosShare:
    def test_sos_share(self, toks):
        b = new_booking(toks)
        try:
            to_accepted(toks, b)
            r = requests.post(f"{BASE_URL}/bookings/{b['id']}/sos", json={"note": "TEST_ iter7"}, headers=H(toks["customer"]))
            assert r.status_code == 200, r.text
            a = r.json()
            assert a.get("share_token") and isinstance(a.get("contacts"), list)
            assert any(c["phone"] == "+919876543210" for c in a["contacts"])
            assert mdb.bookings.find_one({"id": b["id"]})["share_token"] == a["share_token"]
            # driver SOS response should not include customer contacts
            rd = requests.post(f"{BASE_URL}/bookings/{b['id']}/sos", json={"note": "TEST_ drv"}, headers=H(toks["driver"]))
            assert rd.status_code == 200 and "contacts" not in rd.json()
        finally:
            mdb.sos_alerts.update_many({"booking_id": b["id"], "status": {"$ne": "RESOLVED"}},
                                       {"$set": {"status": "RESOLVED", "active": False, "resolution": "TEST_ cleanup"}})
            mdb.bookings.update_one({"id": b["id"]}, {"$set": {"status": "CANCELLED", "sos_active": False}})


# ---------------- Badge bonus on completion ----------------
class TestBadgeBonus:
    def test_bonus_top_and_none(self, toks):
        o = H(toks["owner"])
        uid = requests.get(f"{BASE_URL}/auth/me", headers=H(toks["driver"])).json()["id"]
        orig_badge = mdb.driver_profiles.find_one({"user_id": uid}).get("badge")
        before_earn = requests.get(f"{BASE_URL}/driver/earnings", headers=H(toks["driver"])).json()
        before_admin = requests.get(f"{BASE_URL}/admin/drivers/{uid}", headers=o).json()
        before_pay = next(x for x in requests.get(f"{BASE_URL}/admin/payouts", headers=o).json()["drivers"] if x["driver_id"] == uid)
        try:
            mdb.driver_profiles.update_one({"user_id": uid}, {"$set": {"badge": "top"}})
            b = new_booking(toks)
            to_accepted(toks, b)
            done = run_to_complete(toks, b)
            assert done["badge_bonus"] == 5000 and done["badge_at_completion"] == "top"
            assert mdb.notifications.find_one({"user_id": uid, "booking_id": b["id"], "title": "Badge bonus earned"})
            # non-badge → no bonus
            mdb.driver_profiles.update_one({"user_id": uid}, {"$set": {"badge": None}})
            b2 = new_booking(toks)
            to_accepted(toks, b2)
            done2 = run_to_complete(toks, b2)
            assert not done2.get("badge_bonus")
        finally:
            mdb.driver_profiles.update_one({"user_id": uid}, {"$set": {"badge": orig_badge}})
        delta = done["driver_payout"] + 5000 + done2["driver_payout"]
        e = requests.get(f"{BASE_URL}/driver/earnings", headers=H(toks["driver"])).json()
        assert e["total_earned"] - before_earn["total_earned"] == delta
        assert e["bonus_total"] - before_earn["bonus_total"] == 5000
        it = next(i for i in e["items"] if i["booking_id"] == b["id"])
        assert it["bonus"] == 5000 and it["badge"] == "top"
        assert e["periods"]["today"] - before_earn["periods"]["today"] == delta
        assert e["daily"][-1]["trips"] - before_earn["daily"][-1]["trips"] == 2
        adm = requests.get(f"{BASE_URL}/admin/drivers/{uid}", headers=o).json()
        assert adm["earned"] - before_admin["earned"] == delta, (adm.get("earned"), before_admin.get("earned"))
        pay = next(x for x in requests.get(f"{BASE_URL}/admin/payouts", headers=o).json()["drivers"] if x["driver_id"] == uid)
        assert pay["earned"] - before_pay["earned"] == delta
        print("BONUS_REFS", b["ref"], b2["ref"])
