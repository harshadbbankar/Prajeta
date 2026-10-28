# Iteration 3: staff performance leaderboard + document (identity/police/address) expiry reminders & pausing
import io
import os
import uuid
import asyncio
from datetime import date, timedelta

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
FUTURE = (date.today() + timedelta(days=700)).isoformat()
PAST = (date.today() - timedelta(days=2)).isoformat()
D1, RAVI = "+917000000000", "+919000000002"
load_dotenv("/app/backend/.env")


def run_db(fn):
    async def w():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        return await fn(db)
    return asyncio.run(w())


def login(phone):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    return requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": r.json().get("dev_code") or "123456"})


def H(t):
    return {"Authorization": f"Bearer {t}"}


def upload(tok, doc_type, expiry):
    return requests.post(f"{BASE_URL}/driver/documents", headers=H(tok),
                         data={"doc_type": doc_type, "number": "TEST123", "expiry": expiry},
                         files={"file": ("id.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 100), "image/png")})


def perf(tok, period="30d"):
    return requests.get(f"{BASE_URL}/admin/staff/performance", params={"period": period}, headers=H(tok))


@pytest.fixture(scope="module")
def T():
    toks = {}
    for k, p in {"owner": "9000000001", "ops": "9000000004", "customer": "9000000003",
                 "d1": "7000000000", "ravi": "9000000002"}.items():
        r = login(p)
        assert r.status_code == 200, r.text
        toks[k], toks[k + "_id"] = r.json()["token"], r.json()["user"]["id"]
    fin_phone = "95" + str(uuid.uuid4().int)[:8]
    r = requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_fin3", "phone": fin_phone, "role": "finance"}, headers=H(toks["owner"]))
    assert r.status_code == 200, r.text
    toks["finance"] = login(fin_phone).json()["token"]
    snaps = run_db(lambda db: db.driver_profiles.find({"phone": {"$in": [D1, RAVI]}}, {"_id": 0}).to_list(5))
    yield toks
    async def cleanup(db):
        for s in snaps:
            await db.driver_profiles.replace_one({"phone": s["phone"]}, s)
        await db.users.delete_many({"name": {"$regex": "^TEST_"}, "source": "staff"})
    run_db(cleanup)


# ---- Staff performance
class TestStaffPerformance:
    @pytest.mark.parametrize("period", ["7d", "30d", "month", "all"])
    def test_periods(self, T, period):
        r = perf(T["owner"], period)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["staff"] and "score_formula" in d
        keys = {"tickets_handled", "tickets_resolved", "avg_first_response_mins", "approvals", "docs_verified",
                "assignments", "avg_dispatch_mins", "quotes", "finance_actions", "score"}
        assert keys <= set(d["staff"][0])
        scores = [s["score"] for s in d["staff"]]
        assert scores == sorted(scores, reverse=True)

    @pytest.mark.parametrize("who", ["ops", "finance", "customer"])
    def test_rbac(self, T, who):
        assert perf(T[who]).status_code == 403

    def test_counts_change_after_ops_actions(self, T):
        def me():
            return next(s for s in perf(T["owner"]).json()["staff"] if s["id"] == T["ops_id"])
        before = me()
        # assign
        b = requests.post(f"{BASE_URL}/bookings", json={"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Andheri",
                          "date": TOMORROW, "time": "10:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}, headers=H(T["customer"]))
        assert b.status_code == 200, b.text
        b = b.json()
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=H(T["owner"]))
        a = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": T["ravi_id"]}, headers=H(T["ops"]))
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED", "reason": "TEST cleanup"}, headers=H(T["ops"]))
        assert a.status_code == 200, a.text
        # ticket reply + resolve
        t = requests.post(f"{BASE_URL}/tickets", json={"subject": "TEST_perf", "category": "general", "message": "hi"}, headers=H(T["customer"])).json()
        assert requests.post(f"{BASE_URL}/admin/tickets/{t['id']}/reply", json={"text": "on it"}, headers=H(T["ops"])).status_code == 200
        assert requests.post(f"{BASE_URL}/admin/tickets/{t['id']}/status", json={"status": "resolved"}, headers=H(T["ops"])).status_code == 200
        # doc verify (Ravi police doc)
        p = run_db(lambda db: db.driver_profiles.find_one({"phone": RAVI}, {"_id": 0}))
        doc = next(d for d in p["documents"] if d["doc_type"] == "police_verification")
        v = requests.post(f"{BASE_URL}/admin/drivers/{T['ravi_id']}/documents/{doc['id']}", json={"verified": True}, headers=H(T["ops"]))
        assert v.status_code == 200, v.text
        after = me()
        assert after["assignments"] == before["assignments"] + 1
        assert after["avg_dispatch_mins"] is not None
        assert after["tickets_resolved"] == before["tickets_resolved"] + 1
        assert after["tickets_handled"] == before["tickets_handled"] + 1
        assert after["avg_first_response_mins"] is not None
        assert after["docs_verified"] == before["docs_verified"] + 1
        assert after["score"] >= before["score"] + 2 + 3 + 1 + 1


# ---- Document expiry
class TestDocExpiry:
    def test_licences_rows_per_doc_type(self, T):
        r = requests.get(f"{BASE_URL}/admin/licences", headers=H(T["owner"]))
        assert r.status_code == 200
        rows = r.json()
        d1 = [x for x in rows if x["phone"] == D1 and x["doc_type"] == "identity"]
        rv = [x for x in rows if x["phone"] == RAVI and x["doc_type"] == "police_verification"]
        assert d1 and d1[0]["paused"] is True and d1[0]["days_left"] < 0
        assert rv and 0 < rv[0]["days_left"] <= 30 and rv[0]["paused"] is False
        assert all(x["days_left"] <= 60 for x in rows)
        assert {x["doc_type"] for x in rows} <= {"licence", "identity", "police_verification", "address_proof"}

    def test_d1_paused_state(self, T):
        p = requests.get(f"{BASE_URL}/driver/profile", headers=H(T["d1"])).json()
        assert "identity" in (p.get("docs_expired") or []) and not p.get("online")
        r = requests.post(f"{BASE_URL}/driver/online", json={"online": True}, headers=H(T["d1"]))
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower()

    def test_d1_not_assignable(self, T):
        b = requests.post(f"{BASE_URL}/bookings", json={"service_id": "hourly", "city_id": "pune", "pickup": "TEST_ Kothrud",
                          "date": TOMORROW, "time": "11:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}, headers=H(T["customer"]))
        if b.status_code != 200:
            pytest.skip(b.text)
        b = b.json()
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=H(T["owner"]))
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": T["d1_id"]}, headers=H(T["ops"]))
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED", "reason": "TEST cleanup"}, headers=H(T["ops"]))
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower(), r.text

    def test_ravi_police_reminder_once(self, T):
        def count():
            return run_db(lambda db: db.notifications.count_documents({"user_id": T["ravi_id"], "title": {"$regex": "^Police verification"}}))
        requests.post(f"{BASE_URL}/admin/licences/run-check", headers=H(T["owner"]))
        c1 = count()
        assert c1 >= 1, "Ravi never received police verification reminder"
        for _ in range(2):
            assert requests.post(f"{BASE_URL}/admin/licences/run-check", headers=H(T["owner"])).status_code == 200
        assert count() == c1

    @pytest.mark.parametrize("dt", ["identity", "police_verification", "address_proof"])
    def test_upload_past_expiry_rejected(self, T, dt):
        r = upload(T["d1"], dt, PAST)
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower()

    def test_upload_future_then_verify_unpauses(self, T):
        r = upload(T["d1"], "identity", FUTURE)
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        # still paused until verified
        assert requests.post(f"{BASE_URL}/driver/online", json={"online": True}, headers=H(T["d1"])).status_code == 400
        v = requests.post(f"{BASE_URL}/admin/drivers/{T['d1_id']}/documents/{did}", json={"verified": True}, headers=H(T["owner"]))
        assert v.status_code == 200, v.text
        p = requests.get(f"{BASE_URL}/driver/profile", headers=H(T["d1"])).json()
        assert "identity" not in (p.get("docs_expired") or [])
        on = requests.post(f"{BASE_URL}/driver/online", json={"online": True}, headers=H(T["d1"]))
        assert on.status_code == 200, on.text
        requests.post(f"{BASE_URL}/driver/online", json={"online": False}, headers=H(T["d1"]))
