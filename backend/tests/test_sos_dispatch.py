# Iteration 6: SOS safety alerts (raise / list / acknowledge / resolve / public sos_active) + auto nearest dispatch waves
import os
import random
import time
import uuid
from datetime import date, timedelta, datetime, timezone

import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

ENV = dotenv_values("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]


def login(phone, role="customer"):
    r = requests.post(f"{BASE_URL}/auth/otp/send", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json().get("dev_code") or "123456"
    r = requests.post(f"{BASE_URL}/auth/otp/verify", json={"phone": phone, "code": code, "role": role})
    assert r.status_code == 200, r.text
    return r.json()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def rand_day():
    return (date.today() + timedelta(days=random.randint(40, 300))).isoformat()


@pytest.fixture(scope="module")
def toks():
    mdb.otp_requests.delete_many({})
    t = {k: login(p)["token"] for k, p in
         {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003",
          "finance": "9111111111"}.items()}
    t["other_customer"] = login("97" + str(uuid.uuid4().int)[:8], "customer")["token"]
    t["other_driver"] = login("96" + str(uuid.uuid4().int)[:8], "driver")["token"]
    # verification staff (created via ERP staff API if absent)
    vphone = "9222222222"
    requests.post(f"{BASE_URL}/admin/staff", json={"name": "TEST_Verif", "phone": vphone, "role": "verification"},
                  headers=H(t["owner"]))
    t["verification"] = login(vphone)["token"]
    mdb.otp_requests.delete_many({})
    return t


def new_booking(toks, pickup="TEST_ Gateway of India, Colaba", day=None, tm=None):
    body = {"service_id": "hourly", "city_id": "mumbai", "pickup": pickup, "date": day or rand_day(),
            "time": tm or f"{random.randint(6, 20):02d}:00", "hours": 4, "idempotency_key": str(uuid.uuid4())}
    r = requests.post(f"{BASE_URL}/bookings", json=body, headers=H(toks["customer"]))
    assert r.status_code == 200, r.text
    return r.json()


def confirm(toks, b):
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"},
                      headers=H(toks["owner"]))
    assert r.status_code == 200, r.text


def to_accepted(toks, b):
    o, d = H(toks["owner"]), H(toks["driver"])
    confirm(toks, b)
    uid = requests.get(f"{BASE_URL}/auth/me", headers=d).json()["id"]
    mdb.booking_assignments.update_many({"booking_id": b["id"], "driver_id": uid}, {"$set": {"visible_at": "2000-01-01T00:00:00+00:00"}})
    offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
    mine = [x for x in offers if x["booking_id"] == b["id"]]
    if not mine:
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": uid}, headers=o)
        offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
        mine = [x for x in offers if x["booking_id"] == b["id"]]
    assert mine, "no offer for demo driver"
    acc = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
    assert acc.status_code == 200, acc.text
    return b


# ---------------- SOS ----------------
@pytest.fixture(scope="module")
def trip(toks):
    b = new_booking(toks)
    st = {"b": b}
    yield st
    # cleanup: resolve any SOS left open on this booking, cancel booking
    mdb.sos_alerts.update_many({"booking_id": b["id"], "status": {"$ne": "RESOLVED"}},
                               {"$set": {"status": "RESOLVED", "resolution": "TEST_ cleanup"}})
    mdb.bookings.update_one({"id": b["id"]}, {"$set": {"status": "CANCELLED", "sos_active": False}})


class TestSos:
    def test_sos_before_live_400(self, toks, trip):
        r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/sos", json={"note": "TEST_"}, headers=H(toks["customer"]))
        assert r.status_code == 400, r.text

    def test_accept_trip(self, toks, trip):
        to_accepted(toks, trip["b"])
        b = mdb.bookings.find_one({"id": trip["b"]["id"]})
        assert b["status"] == "ACCEPTED"

    def test_sos_forbidden_others(self, toks, trip):
        for k in ("other_customer", "other_driver", "owner", "ops"):
            r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/sos", json={}, headers=H(toks[k]))
            assert r.status_code == 403, f"{k}: {r.status_code} {r.text}"

    def test_customer_raise_device_location(self, toks, trip):
        r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/sos",
                          json={"note": "TEST_ customer help", "lat": 19.05, "lng": 72.83}, headers=H(toks["customer"]))
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["status"] == "OPEN" and a["raised_by_role"] == "customer"
        assert a["location"]["source"] == "device" and a["location"]["lat"] == 19.05
        assert "_id" not in a and not a.get("duplicate")
        trip["cust_alert"] = a["id"]
        assert mdb.bookings.find_one({"id": trip["b"]["id"]})["sos_active"] is True
        # admins notified
        owner_id = mdb.users.find_one({"phone": "+919000000001"})["id"]
        assert mdb.notifications.find_one({"user_id": owner_id, "booking_id": trip["b"]["id"], "title": {"$regex": "SOS"}})

    def test_customer_duplicate(self, toks, trip):
        r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/sos", json={"note": "again"}, headers=H(toks["customer"]))
        assert r.status_code == 200
        assert r.json()["duplicate"] is True and r.json()["id"] == trip["cust_alert"]
        assert mdb.sos_alerts.count_documents({"booking_id": trip["b"]["id"], "raised_by_role": "customer"}) == 1

    def test_driver_raise_last_known_location(self, toks, trip):
        bid = trip["b"]["id"]
        r = requests.post(f"{BASE_URL}/driver/jobs/{bid}/location", json={"lat": 19.11, "lng": 72.86}, headers=H(toks["driver"]))
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/bookings/{bid}/sos", json={"note": "TEST_ driver", "lat": 500, "lng": 72}, headers=H(toks["driver"]))
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["raised_by_role"] == "driver" and a["location"]["source"] == "driver_last_known"
        assert a["location"]["lat"] == 19.11
        trip["drv_alert"] = a["id"]
        cust_id = mdb.bookings.find_one({"id": bid})["customer_id"]
        assert mdb.notifications.find_one({"user_id": cust_id, "booking_id": bid, "title": "Safety alert raised"})

    def test_customer_not_notified_as_driver_when_customer_raised(self, toks, trip):
        drv_id = mdb.bookings.find_one({"id": trip["b"]["id"]})["driver_id"]
        assert not mdb.notifications.find_one({"user_id": drv_id, "booking_id": trip["b"]["id"], "title": "Safety alert raised"})

    def test_get_my_sos(self, toks, trip):
        bid = trip["b"]["id"]
        r = requests.get(f"{BASE_URL}/bookings/{bid}/sos", headers=H(toks["customer"]))
        assert r.status_code == 200 and r.json()["alert"]["id"] == trip["cust_alert"]
        r = requests.get(f"{BASE_URL}/bookings/{bid}/sos", headers=H(toks["driver"]))
        assert r.status_code == 200 and r.json()["alert"]["id"] == trip["drv_alert"]
        r = requests.get(f"{BASE_URL}/bookings/{bid}/sos", headers=H(toks["other_customer"]))
        assert r.status_code in (403, 404)

    def test_admin_list_roles(self, toks, trip):
        for k in ("owner", "ops"):
            r = requests.get(f"{BASE_URL}/admin/sos?status=active", headers=H(toks[k]))
            assert r.status_code == 200, r.text
            d = r.json()
            ids = [x["id"] for x in d["items"]]
            assert trip["cust_alert"] in ids and trip["drv_alert"] in ids
            assert d["open"] >= 2 and d["active"] >= 2
        for k in ("finance", "verification", "driver", "customer"):
            r = requests.get(f"{BASE_URL}/admin/sos", headers=H(toks[k]))
            assert r.status_code == 403, f"{k}: {r.status_code}"

    def test_public_live_sos_active(self, toks, trip):
        r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/share", headers=H(toks["customer"]))
        assert r.status_code == 200, r.text
        trip["token"] = r.json()["token"]
        r = requests.get(f"{BASE_URL}/public/live/{trip['token']}")
        assert r.status_code == 200 and r.json()["sos_active"] is True, r.text

    def test_acknowledge(self, toks, trip):
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "acknowledge"}, headers=H(toks["ops"]))
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "ACKNOWLEDGED" and r.json()["acknowledged_by"]
        cust_id = mdb.bookings.find_one({"id": trip["b"]["id"]})["customer_id"]
        assert mdb.notifications.find_one({"user_id": cust_id, "title": "Help is on the way", "booking_id": trip["b"]["id"]})
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "acknowledge"}, headers=H(toks["ops"]))
        assert r.status_code == 400
        r = requests.get(f"{BASE_URL}/bookings/{trip['b']['id']}/sos", headers=H(toks["customer"]))
        assert r.json()["alert"]["status"] == "ACKNOWLEDGED"

    def test_bad_actions(self, toks, trip):
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "resolve"}, headers=H(toks["owner"]))
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "delete", "note": "x"}, headers=H(toks["owner"]))
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/admin/sos/nope", json={"action": "resolve", "note": "x"}, headers=H(toks["owner"]))
        assert r.status_code == 404
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "acknowledge"}, headers=H(toks["finance"]))
        assert r.status_code == 403

    def test_resolve_and_clear_flag(self, toks, trip):
        bid = trip["b"]["id"]
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['cust_alert']}", json={"action": "resolve", "note": "TEST_ ok"}, headers=H(toks["owner"]))
        assert r.status_code == 200 and r.json()["status"] == "RESOLVED"
        assert mdb.bookings.find_one({"id": bid})["sos_active"] is True  # driver alert still open
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['drv_alert']}", json={"action": "resolve", "note": "TEST_ ok"}, headers=H(toks["ops"]))
        assert r.status_code == 200
        assert mdb.bookings.find_one({"id": bid})["sos_active"] is False
        r = requests.post(f"{BASE_URL}/admin/sos/{trip['drv_alert']}", json={"action": "resolve", "note": "again"}, headers=H(toks["ops"]))
        assert r.status_code == 400
        r = requests.get(f"{BASE_URL}/public/live/{trip['token']}")
        assert r.json()["sos_active"] is False
        r = requests.get(f"{BASE_URL}/admin/sos?status=resolved", headers=H(toks["owner"]))
        assert trip["drv_alert"] in [x["id"] for x in r.json()["items"]]
        assert all(x["status"] == "RESOLVED" for x in r.json()["items"])
        r = requests.get(f"{BASE_URL}/admin/sos?status=all", headers=H(toks["owner"]))
        assert r.status_code == 200 and len(r.json()["items"]) >= 2

    def test_new_sos_after_resolve(self, toks, trip):
        r = requests.post(f"{BASE_URL}/bookings/{trip['b']['id']}/sos", json={"note": "TEST_ 2"}, headers=H(toks["customer"]))
        assert r.status_code == 200 and not r.json().get("duplicate") and r.json()["id"] != trip["cust_alert"]
        r2 = requests.post(f"{BASE_URL}/admin/sos/{r.json()['id']}", json={"action": "resolve", "note": "TEST_ cleanup"}, headers=H(toks["owner"]))
        assert r2.status_code == 200


# ---------------- Auto nearest dispatch ----------------
CENTER = (19.0760, 72.8777)


@pytest.fixture(scope="module")
def fleet(toks):
    """Create 10 online approved TEST_ drivers in Mumbai at increasing distances from city centre."""
    ravi = mdb.driver_profiles.find_one({"phone": "+919000000002"}, {"_id": 0})
    now = datetime.now(timezone.utc)
    specs = []  # (offset_deg, badge, fresh)
    for i in range(9):
        specs.append((0.01 * (i + 1), "top" if i == 4 else None, True))
    specs.append((0.001, None, False))  # very close but stale location
    specs.append((None, None, True))  # no location at all
    drivers = []
    for i, (off, badge, fresh) in enumerate(specs):
        phone = "95" + str(uuid.uuid4().int)[:8]
        u = login(phone, "driver")
        prof = {**ravi, "id": str(uuid.uuid4()), "user_id": u["user"]["id"], "phone": "+91" + phone,
                "name": f"TEST_Wave{i}", "badge": badge, "online": True, "last_location": None}
        if off is not None:
            at = now if fresh else now - timedelta(minutes=60)
            prof["last_location"] = {"lat": CENTER[0] + off, "lng": CENTER[1], "at": at.isoformat()}
        mdb.driver_profiles.delete_many({"user_id": u["user"]["id"]})
        mdb.driver_profiles.insert_one(dict(prof))
        drivers.append({"i": i, "uid": u["user"]["id"], "tok": u["token"], "badge": badge, "off": off, "fresh": fresh})
    mdb.otp_requests.delete_many({})
    # make Ravi's location stale-safe: leave as-is
    yield drivers
    ids = [d["uid"] for d in drivers]
    mdb.driver_profiles.delete_many({"user_id": {"$in": ids}})


@pytest.fixture(scope="module")
def dispatched(toks, fleet):
    b = new_booking(toks, pickup="TEST_ Chhatrapati Shivaji Terminus")
    confirm(toks, b)
    rows = list(mdb.booking_assignments.find({"booking_id": b["id"]}, {"_id": 0}))
    yield {"b": b, "rows": rows}
    mdb.booking_assignments.update_many({"booking_id": b["id"], "status": "OFFERED"}, {"$set": {"status": "EXPIRED"}})
    mdb.bookings.update_one({"id": b["id"]}, {"$set": {"status": "CANCELLED"}})


class TestDispatch:
    def test_all_offered(self, fleet, dispatched):
        by = {r["driver_id"]: r for r in dispatched["rows"]}
        missing = [d["i"] for d in fleet if d["uid"] not in by]
        assert not missing, f"no offer for TEST drivers {missing}"
        for r in dispatched["rows"]:
            for k in ("wave", "distance_km", "rank", "visible_at", "notified"):
                assert k in r

    def test_ranking_by_distance(self, fleet, dispatched):
        rows = sorted(dispatched["rows"], key=lambda r: r["rank"])
        kms = [r["distance_km"] for r in rows if r["distance_km"] is not None]
        assert kms == sorted(kms), kms
        # None-distance drivers ranked after all located ones
        seen_none = False
        for r in rows:
            if r["distance_km"] is None:
                seen_none = True
            else:
                assert not seen_none, "located driver ranked after driver without location"
        by = {r["driver_id"]: r for r in rows}
        stale = next(d for d in fleet if d["off"] == 0.001)
        assert by[stale["uid"]]["distance_km"] is None, "stale location should not count"

    def test_waves(self, fleet, dispatched):
        rows = sorted(dispatched["rows"], key=lambda r: r["rank"])
        for idx, r in enumerate(rows):
            base = 0 if r["distance_km"] is not None and idx < 3 else 1 if r["distance_km"] is not None and idx < 8 else 2
            exp = max(0, base - 1) if r["priority"] else base
            assert r["wave"] == exp, f"rank {r['rank']} wave {r['wave']} expected {exp} ({r})"
            assert r["notified"] == (r["wave"] == 0)
            ca = datetime.fromisoformat(r["created_at"])
            va = datetime.fromisoformat(r["visible_at"])
            delta = (va - ca).total_seconds() / 60
            assert abs(delta - 3 * r["wave"]) < 0.2, f"visible offset {delta} for wave {r['wave']}"
        by = {r["driver_id"]: r for r in rows}
        badge = next(d for d in fleet if d["badge"])
        assert by[badge["uid"]]["priority"] is True and by[badge["uid"]]["wave"] == 0
        nl = next(d for d in fleet if d["off"] is None)
        assert by[nl["uid"]]["wave"] == 2

    def test_wave0_notified(self, fleet, dispatched):
        rows = [r for r in dispatched["rows"] if r["wave"] == 0]
        assert rows
        for r in rows:
            assert mdb.notifications.find_one({"user_id": r["driver_id"], "booking_id": dispatched["b"]["id"]})

    def test_offers_visibility_and_early_accept(self, fleet, dispatched):
        by = {r["driver_id"]: r for r in dispatched["rows"]}
        bid = dispatched["b"]["id"]
        w0 = next(d for d in fleet if by[d["uid"]]["wave"] == 0)
        offs = requests.get(f"{BASE_URL}/driver/offers", headers=H(w0["tok"])).json()
        mine = [o for o in offs if o["booking_id"] == bid]
        assert mine and mine[0]["distance_km"] is not None and mine[0]["rank"] <= 3
        later = next(d for d in fleet if by[d["uid"]]["wave"] == 1)
        offs = requests.get(f"{BASE_URL}/driver/offers", headers=H(later["tok"])).json()
        assert not [o for o in offs if o["booking_id"] == bid], "future-visible offer leaked"
        assert not mdb.notifications.find_one({"user_id": later["uid"], "booking_id": bid})
        r = requests.post(f"{BASE_URL}/driver/offers/{by[later['uid']]['id']}/accept", headers=H(later["tok"]))
        assert r.status_code == 400, r.text
        dispatched["later"] = later

    def test_background_notifies_due(self, fleet, dispatched):
        by = {r["driver_id"]: r for r in dispatched["rows"]}
        later = dispatched["later"]
        aid = by[later["uid"]]["id"]
        past = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
        mdb.booking_assignments.update_one({"id": aid}, {"$set": {"visible_at": past}})
        ok = False
        for _ in range(14):
            time.sleep(3)
            if mdb.booking_assignments.find_one({"id": aid})["notified"]:
                ok = True
                break
        assert ok, "background loop didn't mark notified within 42s"
        assert mdb.notifications.find_one({"user_id": later["uid"], "booking_id": dispatched["b"]["id"], "title": "New booking offer"})
        offs = requests.get(f"{BASE_URL}/driver/offers", headers=H(later["tok"])).json()
        assert [o for o in offs if o["booking_id"] == dispatched["b"]["id"]]
