# Iteration 2: licence reminders/pausing, licence renewal, staff management, role scoping, tickets mine
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
FUTURE = (date.today() + timedelta(days=900)).isoformat()
PAST = (date.today() - timedelta(days=3)).isoformat()
D2, D3 = "+917000000001", "+917000000002"

load_dotenv("/app/backend/.env")


def run_db(coro_fn):
    async def w():
        db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        return await coro_fn(db)
    return asyncio.run(w())


def login(phone, code=None):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = code or r.json().get("dev_code") or "123456"
    return requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": code})


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def rand_phone(prefix="95"):
    return prefix + str(uuid.uuid4().int)[:8]


@pytest.fixture(scope="session")
def T():
    toks = {}
    for k, p in {"owner": "9000000001", "ops": "9000000004", "customer": "9000000003",
                 "d2": "7000000001", "d3": "7000000002"}.items():
        r = login(p)
        assert r.status_code == 200, r.text
        toks[k] = r.json()["token"]
        toks[k + "_id"] = r.json()["user"]["id"]
    # create role staff for scoping tests
    created = []
    for role in ("finance", "verification", "support"):
        ph = rand_phone()
        r = requests.post(f"{BASE_URL}/admin/staff", json={"name": f"TEST_{role}", "phone": ph, "role": role}, headers=H(toks["owner"]))
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])
        lr = login(ph)
        assert lr.status_code == 200, lr.text
        toks[role] = lr.json()["token"]
        toks[role + "_id"] = r.json()["id"]
    toks["created"] = created
    # snapshot D3 profile for restore
    snap = run_db(lambda db: db.driver_profiles.find_one({"phone": D3}, {"_id": 0}))
    yield toks
    async def cleanup(db):
        await db.driver_profiles.replace_one({"phone": D3}, snap)
        await db.booking_assignments.update_many({"driver_id": snap["user_id"], "status": "OFFERED"}, {"$set": {"status": "WITHDRAWN"}})
        await db.users.delete_many({"name": {"$regex": "^TEST_"}, "source": "staff"})
    run_db(cleanup)


# ---- Licence list & reminders
class TestLicences:
    def test_list_owner(self, T):
        r = requests.get(f"{BASE_URL}/admin/licences", headers=H(T["owner"]))
        assert r.status_code == 200
        rows = {x["phone"]: x for x in r.json()}
        assert D2 in rows and D3 in rows
        assert 0 < rows[D2]["days_left"] <= 30 and rows[D2]["paused"] is False
        assert rows[D3]["days_left"] < 0 and rows[D3]["paused"] is True
        assert [x["days_left"] for x in r.json()] == sorted(x["days_left"] for x in r.json())

    @pytest.mark.parametrize("who,code", [("ops", 200), ("verification", 200), ("finance", 403), ("support", 403), ("customer", 403)])
    def test_list_rbac(self, T, who, code):
        assert requests.get(f"{BASE_URL}/admin/licences", headers=H(T[who])).status_code == code

    def test_expired_state_and_no_duplicate_reminders(self, T):
        async def counts(db):
            p3 = await db.driver_profiles.find_one({"phone": D3}, {"_id": 0})
            return (p3, await db.notifications.count_documents({"user_id": T["d2_id"]}),
                    await db.notifications.count_documents({"user_id": T["owner_id"], "title": {"$regex": "icence"}}),
                    await db.notifications.count_documents({"user_id": T["verification_id"]}),
                    await db.booking_assignments.count_documents({"driver_id": p3["user_id"], "status": "OFFERED"}))
        p3, n2, no, nv, off = run_db(counts)
        assert p3["licence_expired"] is True and p3["online"] is False and off == 0
        assert n2 >= 1 and no >= 2
        r = requests.post(f"{BASE_URL}/admin/licences/run-check", headers=H(T["owner"]))
        assert r.status_code == 200 and r.json() == {"reminded": 0, "paused": 0}
        _, n2b, nob, nvb, _ = run_db(counts)
        assert (n2b, nob, nvb) == (n2, no, nv)

    def test_expired_driver_cannot_go_online(self, T):
        r = requests.post(f"{BASE_URL}/driver/online", json={"online": True}, headers=H(T["d3"]))
        assert r.status_code == 400 and "expired" in r.json()["detail"].lower()

    def test_expired_driver_not_assignable(self, T):
        c = H(T["customer"])
        b = requests.post(f"{BASE_URL}/bookings", json={"service_id": "hourly", "city_id": "delhi-ncr", "pickup": "TEST_ CP",
                          "date": TOMORROW, "time": "11:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}, headers=c)
        if b.status_code != 200:
            pytest.skip(f"cannot create delhi booking: {b.text}")
        b = b.json()
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=H(T["owner"]))
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": T["d3_id"]}, headers=H(T["ops"]))
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED", "reason": "TEST cleanup"}, headers=H(T["ops"]))
        assert r.status_code == 400 and "licence" in r.json()["detail"].lower(), r.text

    def test_dashboard_licences_expired(self, T):
        r = requests.get(f"{BASE_URL}/admin/dashboard", headers=H(T["owner"]))
        assert r.status_code == 200 and r.json()["licences_expired"] >= 1


# ---- Renewal upload & verify (D3 restored in teardown)
class TestRenewal:
    def _up(self, T, expiry):
        return requests.post(f"{BASE_URL}/driver/documents", headers=H(T["d3"]),
                             data={"doc_type": "licence_renewal", "number": "TEST_DL", "expiry": expiry},
                             files={"file": ("lic.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 100), "image/png")})

    def test_requires_future_expiry(self, T):
        assert self._up(T, "").status_code == 400
        assert self._up(T, PAST).status_code == 400

    def test_upload_and_verify(self, T):
        r = self._up(T, FUTURE)
        assert r.status_code == 200, r.text
        doc_id = r.json()["id"]
        lst = {x["phone"]: x for x in requests.get(f"{BASE_URL}/admin/licences", headers=H(T["verification"])).json()}
        assert lst[D3]["renewal_uploaded"] is True and lst[D3]["renewal_expiry"] == FUTURE
        r = requests.post(f"{BASE_URL}/admin/drivers/{T['d3_id']}/documents/{doc_id}", json={"verified": True}, headers=H(T["verification"]))
        assert r.status_code == 200, r.text
        p = run_db(lambda db: db.driver_profiles.find_one({"phone": D3}, {"_id": 0}))
        assert p["licence_expiry"] == FUTURE and p["licence_expired"] is False
        lic = [d for d in p["documents"] if d["doc_type"] in ("licence", "licence_renewal")]
        assert len(lic) == 1 and lic[0]["doc_type"] == "licence" and lic[0]["verified"] is True
        r = requests.post(f"{BASE_URL}/driver/online", json={"online": True}, headers=H(T["d3"]))
        assert r.status_code == 200, r.text
        requests.post(f"{BASE_URL}/driver/online", json={"online": False}, headers=H(T["d3"]))


# ---- Staff management
class TestStaff:
    @pytest.mark.parametrize("who,code", [("owner", 200), ("ops", 403), ("finance", 403), ("customer", 403)])
    def test_list_rbac(self, T, who, code):
        r = requests.get(f"{BASE_URL}/admin/staff", headers=H(T[who]))
        assert r.status_code == code
        if code == 200:
            assert all("_id" not in u for u in r.json()) and any(u["id"] == T["finance_id"] for u in r.json())

    def test_create_validation(self, T):
        o = H(T["owner"])
        assert requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_x", "phone": "9000000003", "role": "ops"}, headers=o).status_code == 400
        assert requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_x", "phone": "7000000001", "role": "ops"}, headers=o).status_code == 400
        assert requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_x", "phone": rand_phone(), "role": "owner"}, headers=o).status_code == 400
        assert requests.post(f"{BASE_URL}/admin/staff", json={"name": "  ", "phone": rand_phone(), "role": "ops"}, headers=o).status_code == 400

    def test_super_admin_rules(self, T):
        o = H(T["owner"])
        ph = rand_phone()
        r = requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_sa", "phone": ph, "role": "super_admin"}, headers=o)
        assert r.status_code == 200 and r.json()["role"] == "super_admin"
        sa_id = r.json()["id"]
        sa = H(login(ph).json()["token"])
        assert requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_sa2", "phone": rand_phone(), "role": "super_admin"}, headers=sa).status_code == 403
        assert requests.put(f"{BASE_URL}/admin/staff/{T['owner_id']}", json={"active": False}, headers=sa).status_code == 403
        assert requests.put(f"{BASE_URL}/admin/staff/{sa_id}", json={"name": "TEST_me"}, headers=sa).status_code == 400
        assert requests.put(f"{BASE_URL}/admin/staff/{T['owner_id']}", json={"name": "x"}, headers=o).status_code == 400
        r = requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_ops_by_sa", "phone": rand_phone(), "role": "ops"}, headers=sa)
        assert r.status_code == 200

    def test_update_role_name_and_pause(self, T):
        o = H(T["owner"])
        ph = rand_phone()
        sid = requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_p", "phone": ph, "role": "support"}, headers=o).json()["id"]
        tok = login(ph).json()["token"]
        r = requests.put(f"{BASE_URL}/admin/staff/{sid}", json={"role": "finance", "name": "TEST_p2"}, headers=o)
        assert r.status_code == 200 and r.json()["role"] == "finance" and r.json()["name"] == "TEST_p2"
        assert requests.get(f"{BASE_URL}/admin/payments", headers=H(tok)).status_code == 200
        r = requests.put(f"{BASE_URL}/admin/staff/{sid}", json={"active": False}, headers=o)
        assert r.status_code == 200 and r.json()["restricted"] is True
        assert requests.get(f"{BASE_URL}/auth/me", headers=H(tok)).status_code == 403
        assert login(ph).status_code == 403
        r = requests.put(f"{BASE_URL}/admin/staff/{sid}", json={"active": True}, headers=o)
        assert r.status_code == 200 and r.json()["restricted"] is False
        assert requests.put(f"{BASE_URL}/admin/staff/{T['customer_id']}", json={"active": False}, headers=o).status_code == 404


# ---- Role scoping
class TestRoleScoping:
    @pytest.mark.parametrize("who,ep,code", [
        ("finance", "payments", 200), ("finance", "owner/overview", 200), ("finance", "drivers", 403), ("finance", "tickets", 403),
        ("verification", "drivers", 200), ("verification", "payments", 403), ("verification", "owner/overview", 403),
        ("support", "tickets", 200), ("support", "bookings", 200), ("support", "owner/overview", 403), ("support", "drivers", 403),
        ("support", "payments", 403), ("ops", "staff", 403)])
    def test_get_scope(self, T, who, ep, code):
        assert requests.get(f"{BASE_URL}/admin/{ep}", headers=H(T[who])).status_code == code

    def test_finance_cannot_assign(self, T):
        r = requests.post(f"{BASE_URL}/admin/bookings/nonexistent/assign", json={"driver_id": T["d2_id"]}, headers=H(T["finance"]))
        assert r.status_code == 403


# ---- Tickets mine filter
class TestTicketsMine:
    def test_mine(self, T):
        t = requests.post(f"{BASE_URL}/tickets", json={"subject": "TEST_mine", "category": "booking", "message": "help"}, headers=H(T["customer"]))
        assert t.status_code == 200, t.text
        tid = t.json()["id"]
        r = requests.post(f"{BASE_URL}/admin/tickets/{tid}/reply", json={"text": "on it"}, headers=H(T["support"]))
        assert r.status_code == 200, r.text
        mine = requests.get(f"{BASE_URL}/admin/tickets", params={"mine": "true"}, headers=H(T["support"])).json()
        assert any(x["id"] == tid for x in mine) and all(x.get("assigned_to_id") == T["support_id"] for x in mine)
        ops_mine = requests.get(f"{BASE_URL}/admin/tickets", params={"mine": "true"}, headers=H(T["ops"])).json()
        assert not any(x["id"] == tid for x in ops_mine)
        # second responder doesn't steal assignment
        requests.post(f"{BASE_URL}/admin/tickets/{tid}/reply", json={"text": "ops note"}, headers=H(T["ops"]))
        t2 = run_db(lambda db: db.support_tickets.find_one({"id": tid}, {"_id": 0}))
        assert t2["assigned_to_id"] == T["support_id"]
