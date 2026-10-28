# Iteration 10: ERP Referral Leaderboard (GET /api/admin/referrals) + thank-you credit (POST /api/admin/referrals/{id}/reward)
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
CODE = "PRJ8YK6Z"
EST = {"service_id": "hourly", "city_id": "mumbai", "hours": 4, "time": "10:00"}


def login(phone, role="customer", name="TEST_Friend"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or "123456"
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": code, "role": role, "name": name})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def rand_phone():
    return "9" + "".join(random.choice("0123456789") for _ in range(9))


def book(tok, coupon=None, name="TEST_Friend"):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Gateway of India, Colaba",
            "date": (date.today() + timedelta(days=random.randint(40, 300))).isoformat(),
            "time": "10:00", "hours": 4, "idempotency_key": str(uuid.uuid4()), "contact_name": name}
    if coupon:
        body["coupon"] = coupon
    r = requests.post(f"{BASE_URL}/bookings", json=body, headers=H(tok))
    assert r.status_code == 200, r.text
    return r.json()


def drive_to_complete(toks, b):
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
    assert requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d).status_code == 200
    assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", json={}, headers=d).status_code == 200
    otp = mdb.bookings.find_one({"id": b["id"]})["trip_otp"]
    assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d).status_code == 200
    r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"cash_collected": False, "end_pin": (__import__("pymongo").MongoClient(__import__("dotenv").dotenv_values("/app/backend/.env")["MONGO_URL"])[__import__("dotenv").dotenv_values("/app/backend/.env")["DB_NAME"]].bookings.find_one({"id": b['id']}) or {}).get("end_otp", "")}, headers=d)
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def toks():
    mdb.otp_requests.delete_many({})
    t = {k: login(p)["token"] for k, p in
         {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003",
          "finance": "9111111111"}.items()}
    mdb.otp_requests.delete_many({})
    return t


@pytest.fixture(scope="module")
def ananya():
    u = mdb.users.find_one({"phone": CUST_PHONE}, {"_id": 0})
    yield u
    mdb.users.update_one({"phone": CUST_PHONE}, {"$set": {k: u.get(k, 0) for k in ("referral_credit", "referral_earned", "referral_bonus_given")}})
    mdb.notifications.delete_many({"user_id": u["id"], "title": {"$regex": "thank-you|Referral reward"}, "created_at": {"$gte": "2026"}})
    mdb.audit_logs.delete_many({"action": "referral_bonus", "entity_id": u["id"]})


@pytest.fixture(scope="module")
def friends(toks, ananya):
    """friend1: referred + COMPLETED; friend2: referred, pending; friend3: referred then CANCELLED."""
    out = []
    for i in range(3):
        d = login(rand_phone(), name=f"TEST_Friend{i+1}")
        out.append(d)
    mdb.otp_requests.delete_many({})
    b1 = book(out[0]["token"], CODE, "TEST_Friend1")
    drive_to_complete(toks, b1)
    b2 = book(out[1]["token"], CODE, "TEST_Friend2")
    b3 = book(out[2]["token"], CODE, "TEST_Friend3")
    mdb.bookings.update_one({"id": b3["id"]}, {"$set": {"status": "CANCELLED"}})
    yield {"users": out, "b1": mdb.bookings.find_one({"id": b1["id"]}, {"_id": 0}), "b2": b2, "b3": b3}
    for d in out:
        uid = d["user"]["id"]
        bids = [b["id"] for b in mdb.bookings.find({"customer_id": uid}, {"id": 1})]
        mdb.booking_assignments.delete_many({"booking_id": {"$in": bids}})
        mdb.payments.delete_many({"booking_id": {"$in": bids}})
        mdb.bookings.delete_many({"customer_id": uid})
        mdb.notifications.delete_many({"user_id": uid})
        mdb.users.delete_one({"id": uid})


# ---------------------------------------------------------------- leaderboard access
class TestLeaderboardAccess:
    @pytest.mark.parametrize("role", ["owner", "finance", "ops"])
    def test_staff_can_view(self, toks, role):
        r = requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks[role]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d) >= {"referrers", "recent", "totals"}
        assert set(d["totals"]) == {"referrers", "friends_joined", "friends_completed", "referred_revenue"}

    @pytest.mark.parametrize("role", ["customer", "driver"])
    def test_non_staff_403(self, toks, role):
        assert requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks[role])).status_code == 403

    def test_unauth(self):
        assert requests.get(f"{BASE_URL}/admin/referrals").status_code in (401, 403)


# ---------------------------------------------------------------- leaderboard data
class TestLeaderboardData:
    def test_row_for_ananya(self, toks, ananya, friends):
        d = requests.get(f"{BASE_URL}/admin/referrals?period=all", headers=H(toks["owner"])).json()
        row = next(x for x in d["referrers"] if x["user_id"] == ananya["id"])
        assert row["code"] == CODE and row["phone"] == CUST_PHONE and row["name"].startswith("Ananya")
        assert row["friends_joined"] == 2, row  # cancelled friend excluded
        assert row["friends_completed"] == 1, row
        assert row["referred_revenue"] == friends["b1"]["fare"]["total"] and row["referred_revenue"] > 0
        assert row["credit_earned"] == ananya.get("referral_earned", 0) + 10000
        assert row["credit_available"] == ananya.get("referral_credit", 0) + 10000
        assert isinstance(row["bonus_given"], int) and row["last_referral_at"]
        assert d["totals"]["referrers"] == len(d["referrers"]) >= 1
        assert d["totals"]["friends_completed"] == sum(x["friends_completed"] for x in d["referrers"])

    def test_recent_list(self, toks, friends):
        d = requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks["owner"])).json()
        assert len(d["recent"]) <= 15
        ids = {x["booking_id"]: x for x in d["recent"]}
        assert friends["b1"]["id"] in ids and friends["b2"]["id"] in ids
        assert friends["b3"]["id"] not in ids  # cancelled excluded
        r1 = ids[friends["b1"]["id"]]
        assert r1["status"] == "COMPLETED" and r1["rewarded"] is True and r1["referrer_name"].startswith("Ananya")
        assert r1["friend_name"] and ids[friends["b2"]["id"]]["rewarded"] is False
        # sorted desc by created_at
        cs = [x["created_at"] for x in d["recent"]]
        assert cs == sorted(cs, reverse=True)

    @pytest.mark.parametrize("period", ["30d", "month", "quarter", "bogus"])
    def test_periods_include_today(self, toks, ananya, friends, period):
        r = requests.get(f"{BASE_URL}/admin/referrals?period={period}", headers=H(toks["owner"]))
        assert r.status_code == 200, r.text
        assert any(x["user_id"] == ananya["id"] for x in r.json()["referrers"])

    def test_sorting(self, toks, friends):
        rows = requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks["owner"])).json()["referrers"]
        keys = [(-x["friends_completed"], -x["friends_joined"], -x["referred_revenue"]) for x in rows]
        assert keys == sorted(keys)

    def test_no_mongo_id(self, toks, friends):
        assert "\"_id\"" not in requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks["owner"])).text


# ---------------------------------------------------------------- reward
class TestReward:
    @pytest.mark.parametrize("amt", [99, 0, -100, 500001])
    def test_amount_bounds_400(self, toks, ananya, amt):
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"amount": amt}, headers=H(toks["owner"]))
        assert r.status_code == 400, r.text

    def test_ops_403(self, toks, ananya):
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"amount": 100}, headers=H(toks["ops"]))
        assert r.status_code == 403

    @pytest.mark.parametrize("role", ["customer", "driver"])
    def test_non_staff_403(self, toks, ananya, role):
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"amount": 100}, headers=H(toks[role]))
        assert r.status_code == 403

    def test_non_customer_404(self, toks):
        drv = requests.get(f"{BASE_URL}/auth/me", headers=H(toks["driver"])).json()["id"]
        for uid in (drv, "nonexistent-id"):
            r = requests.post(f"{BASE_URL}/admin/referrals/{uid}/reward", json={"amount": 100}, headers=H(toks["owner"]))
            assert r.status_code == 404, r.text

    def test_reward_owner_and_finance_persist(self, toks, ananya, friends):
        before = mdb.users.find_one({"id": ananya["id"]}, {"_id": 0})
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"amount": 20000, "note": "TEST_ thanks!"}, headers=H(toks["owner"]))
        assert r.status_code == 200 and r.json()["ok"] is True
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"amount": 100}, headers=H(toks["finance"]))
        assert r.status_code == 200, r.text
        after = mdb.users.find_one({"id": ananya["id"]}, {"_id": 0})
        assert after["referral_credit"] == before.get("referral_credit", 0) + 20100
        assert after["referral_bonus_given"] == before.get("referral_bonus_given", 0) + 20100
        assert after.get("referral_earned", 0) == before.get("referral_earned", 0)
        row = next(x for x in requests.get(f"{BASE_URL}/admin/referrals", headers=H(toks["owner"])).json()["referrers"] if x["user_id"] == ananya["id"])
        assert row["bonus_given"] == after["referral_bonus_given"] and row["credit_available"] == after["referral_credit"]
        n = mdb.notifications.find_one({"user_id": ananya["id"], "title": {"$regex": "thank-you"}, "body": {"$regex": "TEST_ thanks"}})
        assert n and "₹200" in n["body"], n
        assert mdb.audit_logs.count_documents({"action": "referral_bonus", "entity_id": ananya["id"]}) >= 2

    def test_credit_applies_on_estimate(self, toks, ananya):
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json=EST, headers=H(toks["customer"]))
        assert r.status_code == 200, r.text
        f = r.json()
        credit = mdb.users.find_one({"id": ananya["id"]})["referral_credit"]
        assert f["credit_used"] == min(credit, f["subtotal"] - (f["discount"] - f["credit_used"])) and f["credit_used"] > 0

    def test_missing_amount_422(self, toks, ananya):
        r = requests.post(f"{BASE_URL}/admin/referrals/{ananya['id']}/reward", json={"note": "x"}, headers=H(toks["owner"]))
        assert r.status_code == 422
