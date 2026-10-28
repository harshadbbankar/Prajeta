# Prajeta backend regression: auth, public, booking lifecycle, driver, admin, finance, owner, RBAC
import io
import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
TOMORROW = (date.today() + timedelta(days=1)).isoformat()


def login(phone, role="customer"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": "123456", "role": role})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def toks():
    return {k: login(p)["token"] for k, p in
            {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003"}.items()}


@pytest.fixture(scope="session")
def driver_uid(toks):
    return requests.get(f"{BASE_URL}/auth/me", headers=H(toks["driver"])).json()["id"]


# ---- Auth
class TestAuth:
    def test_demo_send_channel(self):
        r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": "9000000003"})
        assert r.status_code == 200 and r.json()["channel"] == "demo"

    def test_wrong_code(self):
        r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": "9000000003", "code": "000000"})
        assert r.status_code == 400

    def test_preview_new_driver_user(self):
        phone = "98" + str(uuid.uuid4().int)[:8]
        r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
        d = r.json()
        assert r.status_code == 200 and d["channel"] == "preview" and len(d["dev_code"]) == 6
        r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": d["dev_code"], "role": "driver", "name": "TEST_Drv"})
        assert r.status_code == 200 and r.json()["user"]["role"] == "driver"
        pytest.new_driver_tok = r.json()["token"]
        pytest.new_driver_id = r.json()["user"]["id"]


# ---- Public
class TestPublic:
    def test_config(self):
        d = requests.get(f"{BASE_URL}/public/config").json()
        assert d["settings"]["company_name"] == "Prajeta" and d["payments_enabled"] is False
        assert any(c["id"] == "mumbai" for c in d["cities"]) and len(d["faqs"]) > 0

    def test_fare_estimate_rules(self):
        day = requests.post(f"{BASE_URL}/public/fare-estimate", json={"service_id": "hourly", "city_id": "pune", "hours": 4, "time": "10:00"}).json()
        night = requests.post(f"{BASE_URL}/public/fare-estimate", json={"service_id": "hourly", "city_id": "pune", "hours": 4, "time": "23:00"}).json()
        mum = requests.post(f"{BASE_URL}/public/fare-estimate", json={"service_id": "hourly", "city_id": "mumbai", "hours": 4, "time": "10:00"}).json()
        cpn = requests.post(f"{BASE_URL}/public/fare-estimate", json={"service_id": "hourly", "city_id": "pune", "hours": 4, "time": "10:00", "coupon": "WELCOME10"}).json()
        print(day, night, mum, cpn, sep="\n")
        assert night["total"] > day["total"]
        assert mum["subtotal"] > day["subtotal"]
        assert abs(day["tax"] - round((day["subtotal"] - day.get("discount", 0)) * 0.18)) <= 1
        assert abs(day["advance"] - round(day["total"] * 0.2)) <= 100  # advance rounded to nearest rupee
        assert cpn["discount"] > 0 and cpn["total"] < day["total"]

    def test_disabled_city(self):
        r = requests.post(f"{BASE_URL}/public/fare-estimate", json={"service_id": "hourly", "city_id": "chennai", "hours": 4})
        assert r.status_code == 400

    def test_enquiry(self):
        r = requests.post(f"{BASE_URL}/public/enquiry", json={"type": "corporate", "name": "TEST_Corp", "phone": "9123456789", "company": "X"})
        assert r.status_code == 200 and r.json()["ref"].startswith("ENQ-")


# ---- Full lifecycle: booking -> cash advance -> offer -> accept -> arrive -> start -> complete
class TestLifecycle:
    def test_flow(self, toks, driver_uid):
        c, o, d = H(toks["customer"]), H(toks["owner"]), H(toks["driver"])
        key = str(uuid.uuid4())
        body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ 1 Marine Drive, Colaba", "date": TOMORROW,
                "time": "10:00", "hours": 4, "idempotency_key": key}
        b = requests.post(f"{BASE_URL}/bookings", json=body, headers=c).json()
        assert b["status"] == "PAYMENT_PENDING" and "trip_otp" not in b
        b2 = requests.post(f"{BASE_URL}/bookings", json=body, headers=c).json()
        assert b2["id"] == b["id"], "idempotency failed"
        # track
        t = requests.get(f"{BASE_URL}/public/track/{b['ref']}", params={"phone": "9000000003"})
        assert t.status_code == 200 and t.json()["status"] == "PAYMENT_PENDING"
        assert requests.get(f"{BASE_URL}/public/track/{b['ref']}", params={"phone": "9111111111"}).status_code == 404
        # online payment not configured
        p = requests.post(f"{BASE_URL}/payments/create", json={"booking_id": b["id"]}, headers=c)
        assert p.status_code == 503, p.text
        # partial cash < advance => still pending
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": 100}, headers=o)
        assert requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()["status"] == "PAYMENT_PENDING"
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"}, headers=o)
        assert r.status_code == 200, r.text
        det = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()
        assert det["status"] == "AWAITING_ASSIGNMENT" and det.get("trip_otp"), det["status"]
        otp = det["trip_otp"]
        offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
        mine = [x for x in offers if x["booking_id"] == b["id"]]
        assert mine, f"no offer broadcast to demo driver: {offers}"
        acc = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
        assert acc.status_code == 200 and acc.json()["status"] == "ACCEPTED", acc.text
        again = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
        assert again.status_code in (400, 409)
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d).status_code == 400
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", headers=d).json()["status"] == "DRIVER_ARRIVED"
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": "0000" if otp != "0000" else "1111"}, headers=d).status_code == 400
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d).json()["status"] == "IN_PROGRESS"
        end_pin = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json().get("end_otp", "")  # trip-end PIN (iter11)
        comp = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"cash_collected": True, "end_pin": end_pin}, headers=d).json()
        assert comp["status"] == "COMPLETED"
        det = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()
        print("payment_status after complete:", det["payment_status"], det.get("balance_due"))
        assert det["payment_status"] == "PAID" and det.get("balance_due", 0) <= 0
        e = requests.get(f"{BASE_URL}/driver/earnings", headers=d).json()
        assert any(i["booking_id"] == b["id"] for i in e["items"])
        inv = requests.get(f"{BASE_URL}/invoices/{b['id']}", headers=c)
        assert inv.status_code == 200
        rv = requests.post(f"{BASE_URL}/bookings/{b['id']}/review", json={"rating": 5, "comment": "TEST"}, headers=c)
        print("review:", rv.status_code, rv.text[:200])

    def test_admin_assign_and_status_reason(self, toks, driver_uid):
        c, o, d = H(toks["customer"]), H(toks["ops"]), H(toks["driver"])
        b = requests.post(f"{BASE_URL}/bookings", json={"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Bandra",
                          "date": TOMORROW, "time": "11:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}, headers=c).json()
        # cannot assign before advance
        assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": driver_uid}, headers=o).status_code == 400
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=H(toks["owner"]))
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": driver_uid}, headers=o)
        assert r.status_code == 200, r.text
        ab = requests.get(f"{BASE_URL}/admin/bookings/{b['id']}", headers=o).json()
        st = ab.get("status") or ab.get("booking", {}).get("status")
        assert st == "ASSIGNED"
        assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED"}, headers=o).status_code == 400
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED", "reason": "TEST cleanup"}, headers=o)
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()["status"] == "CANCELLED"

    def test_quote_flow(self, toks):
        c, o = H(toks["customer"]), H(toks["ops"])
        b = requests.post(f"{BASE_URL}/bookings", json={"service_id": "monthly", "city_id": "mumbai", "pickup": "TEST_ Andheri",
                          "date": TOMORROW, "time": "09:00", "idempotency_key": str(uuid.uuid4())}, headers=c).json()
        assert b["status"] == "QUOTE_REQUESTED", b
        assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/quote", json={"amount": 2500000}, headers=o).status_code == 200
        q = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()
        assert q["status"] == "QUOTED" and q["fare"]["total"] == 2950000 and q["fare"]["advance"] == 590000, q["fare"]
        assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": 590000}, headers=H(toks["owner"])).status_code == 200
        st = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()["status"]
        assert st == "AWAITING_ASSIGNMENT", st
        # cleanup
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/status", json={"status": "CANCELLED", "reason": "TEST cleanup"}, headers=o)


# ---- Driver onboarding + admin verification
class TestOnboarding:
    def test_onboard(self, toks):
        tok = getattr(pytest, "new_driver_tok", None)
        if not tok:
            pytest.skip("no new driver")
        d, o = H(tok), H(toks["owner"])
        r = requests.put(f"{BASE_URL}/driver/profile", json={"name": "TEST_Drv", "address": "Pune", "city_id": "pune",
                         "licence_number": "MH12TEST", "licence_expiry": "2030-01-01", "experience_years": 5, "consent": True}, headers=d)
        assert r.status_code == 200, r.text
        assert requests.post(f"{BASE_URL}/driver/submit", headers=d).status_code == 400  # docs missing
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
        for t in ("licence", "identity"):
            r = requests.post(f"{BASE_URL}/driver/documents", data={"doc_type": t, "number": "X1"},
                              files={"file": ("a.png", io.BytesIO(png), "image/png")}, headers=d)
            assert r.status_code == 200, r.text
        bad = requests.post(f"{BASE_URL}/driver/documents", data={"doc_type": "photo"}, files={"file": ("a.txt", b"x", "text/plain")}, headers=d)
        assert bad.status_code == 400
        assert requests.post(f"{BASE_URL}/driver/submit", headers=d).json()["status"] == "SUBMITTED"
        uid = pytest.new_driver_id
        r = requests.post(f"{BASE_URL}/admin/drivers/{uid}/status", json={"status": "APPROVED"}, headers=o)
        assert r.status_code == 400, f"approve without verified licence should fail: {r.text}"
        prof = requests.get(f"{BASE_URL}/admin/drivers/{uid}", headers=o).json()
        docs = prof.get("documents") or prof.get("profile", {}).get("documents")
        lic = [x for x in docs if x["doc_type"] == "licence"][0]
        f = requests.get(f"{BASE_URL}/files/{lic['id']}", headers=o)
        print("file download:", f.status_code, len(f.content))
        assert requests.post(f"{BASE_URL}/admin/drivers/{uid}/documents/{lic['id']}", json={"verified": True}, headers=o).status_code == 200
        r = requests.post(f"{BASE_URL}/admin/drivers/{uid}/status", json={"status": "APPROVED"}, headers=o)
        assert r.status_code == 200, r.text
        assert requests.get(f"{BASE_URL}/driver/profile", headers=d).json()["status"] == "APPROVED"


# ---- RBAC
class TestRBAC:
    def test_customer_no_admin(self, toks):
        assert requests.get(f"{BASE_URL}/admin/dashboard", headers=H(toks["customer"])).status_code == 403

    def test_driver_no_customer(self, toks):
        assert requests.get(f"{BASE_URL}/bookings", headers=H(toks["driver"])).status_code == 403

    def test_ops_no_owner_intel(self, toks):
        r = requests.get(f"{BASE_URL}/admin/owner/overview", headers=H(toks["ops"]))
        print("ops owner overview:", r.status_code)
        assert r.status_code == 403

    def test_no_token(self):
        assert requests.get(f"{BASE_URL}/admin/dashboard").status_code in (401, 403)


# ---- Owner intelligence, finance, tariffs, settings
class TestOwnerFinance:
    def test_owner_endpoints(self, toks):
        o = H(toks["owner"])
        for ep in ("overview", "services", "cities", "insights", "actions"):
            r = requests.get(f"{BASE_URL}/admin/owner/{ep}", headers=o)
            assert r.status_code == 200, f"{ep}: {r.text[:200]}"
        a = requests.post(f"{BASE_URL}/admin/owner/actions", json={"finding": "TEST_f", "action": "TEST_a"}, headers=o)
        assert a.status_code == 200, a.text
        aid = a.json()["id"]
        u = requests.put(f"{BASE_URL}/admin/owner/actions/{aid}", json={"finding": "TEST_f", "action": "TEST_a", "status": "Done"}, headers=o)
        assert u.status_code == 200, u.text
        lst = requests.get(f"{BASE_URL}/admin/owner/actions", headers=o).json()
        assert any(x["id"] == aid for x in lst)

    def test_finance(self, toks, driver_uid):
        o = H(toks["owner"])
        pays = requests.get(f"{BASE_URL}/admin/payments", headers=o).json()
        pays = pays.get("items", pays) if isinstance(pays, dict) else pays
        cash = [p for p in pays if p.get("method") == "cash" and p.get("status") == "paid"]
        assert cash
        r = requests.post(f"{BASE_URL}/admin/payments/{cash[0]['id']}/refund", json={"amount": 100, "reason": "TEST"}, headers=o)
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/admin/expenses", json={"category": "Marketing", "amount": 50000, "date": date.today().isoformat(), "note": "TEST_"}, headers=o)
        assert r.status_code == 200, r.text
        assert requests.get(f"{BASE_URL}/admin/expenses", headers=o).status_code == 200
        r = requests.post(f"{BASE_URL}/admin/payouts", json={"driver_id": driver_uid, "amount": 100, "reference": "TEST_UTR"}, headers=o)
        assert r.status_code == 200, r.text
        assert requests.get(f"{BASE_URL}/admin/payouts", headers=o).status_code == 200

    def test_tariff_version(self, toks):
        o = H(toks["owner"])
        s = [x for x in requests.get(f"{BASE_URL}/admin/services", headers=o).json() if x["id"] == "hourly"][0]
        v = s.get("tariff_version", 0)
        r = requests.put(f"{BASE_URL}/admin/services/hourly", json={"base_fare": s["base_fare"]}, headers=o)
        assert r.status_code == 200, r.text
        s2 = [x for x in requests.get(f"{BASE_URL}/admin/services", headers=o).json() if x["id"] == "hourly"][0]
        assert s2["tariff_version"] == v + 1

    def test_settings(self, toks):
        o = H(toks["owner"])
        s = requests.get(f"{BASE_URL}/admin/settings", headers=o).json()
        r = requests.put(f"{BASE_URL}/admin/settings", json={"tagline": s.get("tagline")}, headers=o)
        assert r.status_code == 200, r.text

    def test_lists(self, toks):
        o = H(toks["owner"])
        for ep in ("dashboard", "drivers", "customers", "bookings", "tickets", "enquiries", "audit-logs", "cities"):
            r = requests.get(f"{BASE_URL}/admin/{ep}", headers=o)
            assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:150]}"

    def test_ticket(self, toks):
        r = requests.post(f"{BASE_URL}/tickets", json={"subject": "TEST_ticket", "category": "booking", "message": "help"}, headers=H(toks["customer"]))
        print("ticket:", r.status_code, r.text[:200])
        assert r.status_code == 200
