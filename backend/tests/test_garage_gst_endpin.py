# Iteration 11: customer vehicle garage, GST billing + invoice split, trip-end PIN handover
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


def login(phone, role="customer"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": "123456", "role": role})
    assert r.status_code == 200, r.text
    return r.json()


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def toks():
    mdb.otp_requests.delete_many({})
    d = {k: login(p) for k, p in {"owner": "9000000001", "driver": "9000000002", "customer": "9000000003"}.items()}
    yield {k: v["token"] for k, v in d.items()} | {"driver_id": d["driver"]["user"]["id"], "cust_id": d["customer"]["user"]["id"]}
    # cleanup TEST_ data on Ananya
    mdb.vehicles.delete_many({"user_id": d["customer"]["user"]["id"], "make": {"$regex": "^TEST_"}})
    mdb.users.update_one({"id": d["customer"]["user"]["id"]}, {"$unset": {"billing": ""}})
    mdb.system_settings.update_one({"id": "main"}, {"$unset": {"gstin": ""}})


def book(tok, **extra):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": "TEST_ Colaba, Mumbai",
            "date": (date.today() + timedelta(days=random.randint(40, 300))).isoformat(),
            "time": f"{random.randint(7, 19):02d}:00", "hours": 4, "idempotency_key": str(uuid.uuid4()), **extra}
    return requests.post(f"{BASE_URL}/bookings", json=body, headers=H(tok))


def veh(reg, **kw):
    return {"reg_number": reg, "make": "TEST_Honda", "model": "City", "body_type": "Sedan", "transmission": "Automatic", **kw}


# ---- Garage
class TestGarage:
    def test_add_normalises_and_lists(self, toks):
        c = H(toks["customer"])
        r = requests.post(f"{BASE_URL}/me/vehicles", json=veh("mh 01-ab 1234"), headers=c)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["reg_number"] == "MH01AB1234" and v["transmission"] == "Automatic" and "_id" not in v and "user_id" in v
        items = requests.get(f"{BASE_URL}/me/vehicles", headers=c).json()["items"]
        assert any(i["id"] == v["id"] for i in items)
        # duplicate
        assert requests.post(f"{BASE_URL}/me/vehicles", json=veh("MH01AB1234"), headers=c).status_code == 409

    @pytest.mark.parametrize("payload", [veh("12345"), veh("MH01AB1234X1"), veh("MH02CD1111", body_type="Truck"),
                                         veh("MH02CD1111", transmission="CVT"), veh("MH02CD1111", make=" ")])
    def test_add_validation(self, toks, payload):
        r = requests.post(f"{BASE_URL}/me/vehicles", json=payload, headers=H(toks["customer"]))
        assert r.status_code == 400, r.text

    def test_bh_series_ok(self, toks):
        r = requests.post(f"{BASE_URL}/me/vehicles", json=veh("22BH1234AB", body_type="EV", transmission="EV"), headers=H(toks["customer"]))
        assert r.status_code == 200, r.text

    def test_role_guard_and_foreign_delete(self, toks):
        assert requests.get(f"{BASE_URL}/me/vehicles", headers=H(toks["driver"])).status_code == 403
        assert requests.get(f"{BASE_URL}/me/vehicles").status_code in (401, 403)
        mine = requests.get(f"{BASE_URL}/me/vehicles", headers=H(toks["customer"])).json()["items"][0]
        assert requests.delete(f"{BASE_URL}/me/vehicles/{mine['id']}", headers=H(toks["owner"])).status_code in (403, 404)
        assert requests.delete(f"{BASE_URL}/me/vehicles/nonexistent", headers=H(toks["customer"])).status_code == 404

    def test_max_10(self, toks):
        c = H(toks["customer"])
        n = len(requests.get(f"{BASE_URL}/me/vehicles", headers=c).json()["items"])
        for i in range(10 - n):
            assert requests.post(f"{BASE_URL}/me/vehicles", json=veh(f"KA05MX{1000 + i}"), headers=c).status_code == 200
        r = requests.post(f"{BASE_URL}/me/vehicles", json=veh("KA05MX9999"), headers=c)
        assert r.status_code == 400 and "10" in r.text
        for v in requests.get(f"{BASE_URL}/me/vehicles", headers=c).json()["items"]:
            if v["reg_number"].startswith("KA05MX") or v["reg_number"] == "22BH1234AB":
                assert requests.delete(f"{BASE_URL}/me/vehicles/{v['id']}", headers=c).status_code == 200

    def test_booking_vehicle_snapshot(self, toks):
        c = H(toks["customer"])
        v = next(i for i in requests.get(f"{BASE_URL}/me/vehicles", headers=c).json()["items"] if i["reg_number"] == "MH01AB1234")
        r = book(toks["customer"], vehicle_id=v["id"], vehicle_type="Hatchback", transmission="Manual")
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["vehicle"]["reg_number"] == "MH01AB1234" and b["vehicle_type"] == "Sedan" and b["transmission"] == "Automatic"
        assert "user_id" not in b["vehicle"]
        assert book(toks["customer"], vehicle_id="bogus").status_code == 400
        mdb.bookings.delete_one({"id": b["id"]})


# ---- GST billing
class TestBilling:
    def test_validation(self, toks):
        c = H(toks["customer"])
        assert requests.put(f"{BASE_URL}/me/billing", json={"company_name": "TEST_Co", "gstin": "27ABCDE1234F1Z"}, headers=c).status_code == 400
        assert requests.put(f"{BASE_URL}/me/billing", json={"company_name": " ", "gstin": "27ABCDE1234F1Z5"}, headers=c).status_code == 400
        assert requests.put(f"{BASE_URL}/me/billing", json={"company_name": "x", "gstin": "27ABCDE1234F1Z5"}, headers=H(toks["driver"])).status_code == 403

    def test_set_get_clear(self, toks):
        c = H(toks["customer"])
        r = requests.put(f"{BASE_URL}/me/billing", json={"company_name": "TEST_Acme Pvt Ltd", "gstin": "27abcde1234f1z5", "address": "Andheri"}, headers=c)
        assert r.status_code == 200 and r.json()["billing"]["gstin"] == "27ABCDE1234F1Z5"
        assert requests.get(f"{BASE_URL}/me/billing", headers=c).json()["billing"]["company_name"] == "TEST_Acme Pvt Ltd"
        assert requests.put(f"{BASE_URL}/me/billing", json={"gstin": ""}, headers=c).json()["billing"] is None
        assert requests.get(f"{BASE_URL}/me/billing", headers=c).json()["billing"] is None

    def test_invoice_split(self, toks):
        c = H(toks["customer"])
        # no billing -> single GST row
        b0 = book(toks["customer"]).json()
        assert b0.get("billing") is None
        h0 = requests.get(f"{BASE_URL}/invoices/{b0['id']}", headers=c).text
        assert "customer-gstin" not in h0 and "id=cgst" not in h0 and "GST (" in h0
        requests.put(f"{BASE_URL}/me/billing", json={"company_name": "TEST_Acme", "gstin": "27ABCDE1234F1Z5"}, headers=c)
        b1 = book(toks["customer"]).json()
        assert b1["billing"]["gstin"] == "27ABCDE1234F1Z5"
        mdb.system_settings.update_one({"id": "main"}, {"$unset": {"gstin": ""}})
        h1 = requests.get(f"{BASE_URL}/invoices/{b1['id']}", headers=c).text
        assert "id=customer-gstin" in h1 and "id=taxable" in h1 and "id=cgst" in h1 and "id=sgst" in h1 and "id=igst" not in h1
        mdb.system_settings.update_one({"id": "main"}, {"$set": {"gstin": "29AAACP1234Q1Z2"}})  # Karnataka supplier
        h2 = requests.get(f"{BASE_URL}/invoices/{b1['id']}", headers=c).text
        assert "id=igst" in h2 and "id=cgst" not in h2
        mdb.system_settings.update_one({"id": "main"}, {"$set": {"gstin": "27AAACP1234Q1Z2"}})
        assert "id=cgst" in requests.get(f"{BASE_URL}/invoices/{b1['id']}", headers=c).text
        mdb.system_settings.update_one({"id": "main"}, {"$unset": {"gstin": ""}})
        # tax rows sum equals fare tax: check old booking unaffected after billing set
        assert "customer-gstin" not in requests.get(f"{BASE_URL}/invoices/{b0['id']}", headers=c).text
        requests.put(f"{BASE_URL}/me/billing", json={"gstin": ""}, headers=c)
        mdb.bookings.delete_many({"id": {"$in": [b0["id"], b1["id"]]}})


# ---- Trip-end PIN full lifecycle
class TestEndPin:
    def _to_in_progress(self, toks, vehicle_id=None):
        c, o, d = H(toks["customer"]), H(toks["owner"]), H(toks["driver"])
        b = book(toks["customer"], **({"vehicle_id": vehicle_id} if vehicle_id else {})).json()
        assert "end_otp" not in b and "trip_otp" not in b
        assert requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"]}, headers=o).status_code == 200
        cb = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()
        assert len(cb["end_otp"]) == 4 and cb["end_otp"].isdigit() and len(cb["trip_otp"]) == 4
        r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": toks["driver_id"]}, headers=o)
        assert r.status_code == 200, r.text
        # ERP must not leak PINs
        ab = requests.get(f"{BASE_URL}/admin/bookings/{b['id']}", headers=o).text
        assert cb["end_otp"] not in ab.replace(b["id"], "") or "end_otp" not in ab
        assert "end_otp" not in ab and "trip_otp" not in ab
        lst = requests.get(f"{BASE_URL}/admin/bookings", headers=o).text
        assert "end_otp" not in lst
        offer = next(x for x in requests.get(f"{BASE_URL}/driver/offers", headers=d).json() if x["booking_id"] == b["id"])
        assert "end_otp" not in str(offer)
        assert requests.post(f"{BASE_URL}/driver/offers/{offer['id']}/accept", headers=d).status_code == 200
        job = requests.get(f"{BASE_URL}/driver/jobs/{b['id']}", headers=d).json()
        assert "end_otp" not in job and "trip_otp" not in job and job["end_pin_required"] is True
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", headers=d).status_code == 200
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": cb["trip_otp"]}, headers=d).status_code == 200
        return b, cb, job

    def test_complete_requires_pin(self, toks):
        d = H(toks["driver"])
        v = requests.post(f"{BASE_URL}/me/vehicles", json=veh("MH12ZZ0001"), headers=H(toks["customer"])).json()
        b, cb, job = self._to_in_progress(toks, v["id"])
        assert job["vehicle"]["reg_number"] == "MH12ZZ0001"
        wrong = "0000" if cb["end_otp"] != "0000" else "1111"
        r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"end_pin": wrong}, headers=d)
        assert r.status_code == 400 and "Wrong handover PIN" in r.text
        assert requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={}, headers=d).status_code == 400
        r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"end_pin": cb["end_otp"]}, headers=d)
        assert r.status_code == 200, r.text
        assert requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=H(toks["customer"])).json()["status"] == "COMPLETED"
        mdb.bookings.delete_one({"id": b["id"]})

    def test_legacy_booking_without_end_otp(self, toks):
        d = H(toks["driver"])
        b, cb, _ = self._to_in_progress(toks)
        mdb.bookings.update_one({"id": b["id"]}, {"$unset": {"end_otp": ""}})
        r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={}, headers=d)
        assert r.status_code == 200, r.text
        mdb.bookings.delete_one({"id": b["id"]})
