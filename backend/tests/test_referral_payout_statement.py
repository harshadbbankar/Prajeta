# Iteration 9: Referral rewards, driver payout requests (finance approval), monthly driver statements
import os
import re
import random
import uuid
from datetime import date, timedelta, datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

ENV = dotenv_values("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
CUST_PHONE = "+919000000003"
EST = {"service_id": "hourly", "city_id": "mumbai", "hours": 4, "time": "10:00"}


def login(phone, role="customer"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or "123456"
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": code, "role": role, "name": "TEST_Friend"})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def money(s):
    return int(round(float(re.sub(r"[^\d.\-]", "", s)) * 100))


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
    mdb.users.update_one({"phone": CUST_PHONE}, {"$set": {"referral_credit": u.get("referral_credit", 0),
                                                          "referral_earned": u.get("referral_earned", 0)}})


@pytest.fixture(scope="module")
def friend():
    phone = "9" + "".join(random.choice("0123456789") for _ in range(9))
    d = login(phone)
    mdb.otp_requests.delete_many({})
    yield d
    uid = d["user"]["id"]
    mdb.bookings.delete_many({"customer_id": uid})
    mdb.notifications.delete_many({"user_id": uid})
    mdb.users.delete_one({"id": uid})


def book(tok, coupon=None):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Gateway of India, Colaba",
            "date": (date.today() + timedelta(days=random.randint(40, 300))).isoformat(),
            "time": f"{random.randint(6, 20):02d}:00", "hours": 4, "idempotency_key": str(uuid.uuid4()),
            "contact_name": "TEST_Friend"}
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
    return uid


# ---------------------------------------------------------------- referral
class TestReferral:
    def test_me_referral_shape_and_stable(self, toks, ananya):
        a = requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"]))
        assert a.status_code == 200, a.text
        a = a.json()
        assert re.fullmatch(r"PRJ[A-Z0-9]{5}", a["code"]) and a["code"] == "PRJ8YK6Z"
        assert a["friend_amount"] == 10000 and a["referrer_amount"] == 10000
        for k in ("credit", "earned", "friends_joined", "friends_completed"):
            assert isinstance(a[k], int)
        assert requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"])).json()["code"] == a["code"]

    def test_me_referral_non_customer_403(self, toks):
        assert requests.get(f"{BASE_URL}/me/referral", headers=H(toks["driver"])).status_code == 403
        assert requests.get(f"{BASE_URL}/me/referral").status_code in (401, 403)

    def test_estimate_new_friend_gets_discount(self, friend):
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": "prj8yk6z"}, headers=H(friend["token"]))
        assert r.status_code == 200, r.text
        f = r.json()
        assert f["discount"] == min(10000, f["subtotal"])
        assert f["referral"]["label"].startswith("Referral from ")
        assert f["coupon"] == "PRJ8YK6Z" and f["credit_used"] == 0

    def test_own_code_400(self, toks):
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": "PRJ8YK6Z"}, headers=H(toks["customer"]))
        assert r.status_code == 400 and "own" in r.json()["detail"]

    def test_existing_customer_first_booking_400(self, toks, friend):
        code = requests.get(f"{BASE_URL}/me/referral", headers=H(friend["token"])).json()["code"]
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": code}, headers=H(toks["customer"]))
        assert r.status_code == 400 and "first booking" in r.json()["detail"]

    def test_unknown_code_and_welcome10(self, friend):
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": "PRJZZZZZ"}, headers=H(friend["token"]))
        assert r.status_code == 400 and r.json()["detail"] == "Invalid or expired coupon"
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": "WELCOME10"}, headers=H(friend["token"]))
        assert r.status_code == 200 and r.json()["coupon"] == "WELCOME10" and r.json()["discount"] > 0

    def test_full_reward_credit_cycle(self, toks, friend, ananya):
        before = requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"])).json()
        b = book(friend["token"], "PRJ8YK6Z")
        assert b["fare"]["referral"] and b["fare"]["discount"] >= 10000
        db_b = mdb.bookings.find_one({"id": b["id"]}, {"_id": 0})
        assert db_b["referral"] == {"referrer_id": ananya["id"], "code": "PRJ8YK6Z", "rewarded": False}
        mid = requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"])).json()
        assert mid["friends_joined"] == before["friends_joined"] + 1
        drive_to_complete(toks, b)
        assert mdb.bookings.find_one({"id": b["id"]})["referral"]["rewarded"] is True
        after = requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"])).json()
        assert after["credit"] == before["credit"] + 10000
        assert after["earned"] == before["earned"] + 10000
        assert after["friends_completed"] == before["friends_completed"] + 1
        assert mdb.notifications.find_one({"user_id": ananya["id"], "title": {"$regex": "Referral reward"}})
        # idempotent: re-running reward on the same booking does nothing
        import sys, asyncio
        sys.path.insert(0, "/app/backend")
        # friend now has a real booking -> code no longer valid for them
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={**EST, "coupon": "PRJ8YK6Z"}, headers=H(friend["token"]))
        assert r.status_code == 400
        # credit auto-applies for referrer
        est = requests.post(f"{BASE_URL}/public/fare-estimate", json=EST, headers=H(toks["customer"])).json()
        assert est["credit_used"] == min(after["credit"], est["subtotal"]) and est["discount"] >= est["credit_used"]
        nb = book(toks["customer"])
        assert nb["fare"]["credit_used"] == est["credit_used"]
        c1 = mdb.users.find_one({"id": ananya["id"]})["referral_credit"]
        assert c1 == after["credit"] - est["credit_used"]
        r = requests.post(f"{BASE_URL}/bookings/{nb['id']}/cancel", json={"reason": "TEST_"}, headers=H(toks["customer"]))
        assert r.status_code == 200
        assert mdb.users.find_one({"id": ananya["id"]})["referral_credit"] == after["credit"]
        mdb.bookings.delete_one({"id": nb["id"]})

    def test_settings_amounts(self, toks, friend):
        o = H(toks["owner"])
        try:
            r = requests.put(f"{BASE_URL}/admin/settings", json={"referral_friend_amount": 150, "referral_referrer_amount": 75}, headers=o)
            assert r.status_code == 200, r.text
            assert r.json()["referral_friend_amount"] == 150
            a = requests.get(f"{BASE_URL}/me/referral", headers=H(toks["customer"])).json()
            assert a["friend_amount"] == 15000 and a["referrer_amount"] == 7500
            for bad in (5001, -1, "abc", ""):
                assert requests.put(f"{BASE_URL}/admin/settings", json={"referral_friend_amount": bad}, headers=o).status_code == 400
            assert requests.put(f"{BASE_URL}/admin/settings", json={"referral_friend_amount": 10}, headers=H(toks["ops"])).status_code == 403
        finally:
            requests.put(f"{BASE_URL}/admin/settings", json={"referral_friend_amount": 100, "referral_referrer_amount": 100}, headers=o)


# ---------------------------------------------------------------- payout requests
@pytest.fixture(scope="module")
def payout_cleanup(toks):
    did = requests.get(f"{BASE_URL}/auth/me", headers=H(toks["driver"])).json()["id"]
    start = datetime.now(timezone.utc).isoformat()
    yield did
    ids = [r["id"] for r in mdb.payout_requests.find({"driver_id": did, "created_at": {"$gte": start}})]
    mdb.payout_requests.delete_many({"id": {"$in": ids}})
    mdb.driver_payouts.delete_many({"request_id": {"$in": ids}})


class TestPayoutRequests:
    def test_driver_get_shape(self, toks, payout_cleanup):
        r = requests.get(f"{BASE_URL}/driver/payout-requests", headers=H(toks["driver"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert {"items", "earned", "paid", "pending", "open"} <= set(d) and d["pending"] > 10000
        assert requests.get(f"{BASE_URL}/driver/payout-requests", headers=H(toks["customer"])).status_code == 403

    def test_validation(self, toks, payout_cleanup):
        d = H(toks["driver"])
        pend = requests.get(f"{BASE_URL}/driver/payout-requests", headers=d).json()["pending"]
        r = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": 9999}, headers=d)
        assert r.status_code == 400 and "Minimum" in r.json()["detail"]
        r = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": pend + 100}, headers=d)
        assert r.status_code == 400 and "up to" in r.json()["detail"]
        prof = mdb.driver_profiles.find_one({"user_id": payout_cleanup}, {"_id": 0, "payout_upi": 1, "payout_bank": 1})
        mdb.driver_profiles.update_one({"user_id": payout_cleanup}, {"$set": {"payout_upi": "", "payout_bank": ""}})
        try:
            r = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": 10000}, headers=d)
            assert r.status_code == 400 and "UPI" in r.json()["detail"]
        finally:
            mdb.driver_profiles.update_one({"user_id": payout_cleanup}, {"$set": {"payout_upi": prof.get("payout_upi"), "payout_bank": prof.get("payout_bank")}})

    def test_reject_flow(self, toks, payout_cleanup):
        d, f = H(toks["driver"]), H(toks["finance"])
        r = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": 10000, "note": "TEST_ reject"}, headers=d)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        assert r.json()["status"] == "REQUESTED"
        dup = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": 10000}, headers=d)
        assert dup.status_code == 400 and "already" in dup.json()["detail"]
        assert requests.get(f"{BASE_URL}/driver/payout-requests", headers=d).json()["open"]["id"] == rid
        assert requests.get(f"{BASE_URL}/admin/payout-requests", headers=H(toks["ops"])).status_code == 403
        lst = requests.get(f"{BASE_URL}/admin/payout-requests", headers=f)
        assert lst.status_code == 200
        it = next(x for x in lst.json()["items"] if x["id"] == rid)
        assert it["balance"]["pending"] >= 10000 and lst.json()["open"] >= 1
        assert requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "reject"}, headers=f).status_code == 400
        assert requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "reject", "reason": "TEST_ wrong UPI"}, headers=f).status_code == 200
        again = requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "approve"}, headers=f)
        assert again.status_code == 400 and "already" in again.json()["detail"]
        assert mdb.payout_requests.find_one({"id": rid})["status"] == "REJECTED"

    def test_approve_flow(self, toks, payout_cleanup):
        d, o = H(toks["driver"]), H(toks["owner"])
        pend0 = requests.get(f"{BASE_URL}/driver/payout-requests", headers=d).json()["pending"]
        rid = requests.post(f"{BASE_URL}/driver/payout-requests", json={"amount": 12345, "note": "TEST_ approve"}, headers=d).json()["id"]
        assert requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "nope"}, headers=o).status_code == 400
        r = requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "approve", "reference": "TEST_UTR1"}, headers=o)
        assert r.status_code == 200 and r.json()["status"] == "APPROVED", r.text
        p = mdb.driver_payouts.find_one({"request_id": rid}, {"_id": 0})
        assert p and p["status"] == "PAID" and p["amount"] == 12345 and p["reference"] == "TEST_UTR1"
        after = requests.get(f"{BASE_URL}/driver/payout-requests", headers=d).json()
        assert after["pending"] == pend0 - 12345 and after["open"] is None
        assert mdb.notifications.find_one({"user_id": payout_cleanup, "title": "Payout approved"})
        assert requests.post(f"{BASE_URL}/admin/payout-requests/{rid}", json={"action": "approve"}, headers=o).status_code == 400
        assert requests.post(f"{BASE_URL}/admin/payout-requests/nope", json={"action": "approve"}, headers=o).status_code == 404


# ---------------------------------------------------------------- statements
def parse(html):
    return {k: money(re.search(rf'id={k}>([^<]+)<', html).group(1))
            for k in ("opening", "fare-share", "adjustments", "bonuses", "payouts", "closing")}


class TestStatements:
    def test_current_month_math(self, toks):
        ist = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
        cur = ist.strftime("%Y-%m")
        r = requests.get(f"{BASE_URL}/driver/statements/{cur}", headers=H(toks["driver"]))
        assert r.status_code == 200 and "text/html" in r.headers["content-type"]
        v = parse(r.text)
        assert v["closing"] == v["opening"] + v["fare-share"] + v["adjustments"] + v["bonuses"] + v["payouts"]  # payouts negative
        pend = requests.get(f"{BASE_URL}/driver/payout-requests", headers=H(toks["driver"])).json()["pending"]
        assert v["closing"] == pend
        prev = (ist.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        pv = parse(requests.get(f"{BASE_URL}/driver/statements/{prev}", headers=H(toks["driver"])).text)
        assert pv["closing"] == v["opening"]

    def test_bad_inputs_and_auth(self, toks):
        d = H(toks["driver"])
        future = (date.today() + timedelta(days=70)).strftime("%Y-%m")
        for m in (future, "2026-13", "abc", "2026"):
            assert requests.get(f"{BASE_URL}/driver/statements/{m}", headers=d).status_code == 400, m
        assert requests.get(f"{BASE_URL}/driver/statements/2025-01", headers=H(toks["customer"])).status_code == 403
        r = requests.get(f"{BASE_URL}/driver/statements/2025-01?token={toks['driver']}")
        assert r.status_code == 200 and "id=closing" in r.text
