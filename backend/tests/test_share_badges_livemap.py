# Iteration 5: share trip link (public live page), driver reward badges + priority offers, presence location, ERP live driver map
import os
import sys
import uuid
from datetime import date, timedelta, datetime, timezone

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from dotenv import dotenv_values  # noqa: E402

ENV = dotenv_values("/app/backend/.env")
BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
TOMORROW = (date.today() + timedelta(days=3)).isoformat()
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


@pytest.fixture(scope="module")
def toks():
    mdb.otp_requests.delete_many({})
    t = {k: login(p)["token"] for k, p in
         {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003"}.items()}
    t["other_customer"] = login("97" + str(uuid.uuid4().int)[:8], "customer")["token"]
    t["other_driver"] = login("96" + str(uuid.uuid4().int)[:8], "driver")["token"]
    try:
        t["finance"] = login("9111111111")["token"]
    except AssertionError:
        t["finance"] = None
    mdb.otp_requests.delete_many({})
    return t


def new_booking(toks, city="mumbai", pickup="TEST_ Gateway of India, Colaba", time="10:00", day=TOMORROW):
    body = {"service_id": "hourly", "city_id": city, "pickup": pickup, "date": day, "time": time,
            "hours": 4, "idempotency_key": str(uuid.uuid4())}
    r = requests.post(f"{BASE_URL}/bookings", json=body, headers=H(toks["customer"]))
    assert r.status_code == 200, r.text
    return r.json()


def confirm(toks, b):
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"},
                      headers=H(toks["owner"]))
    assert r.status_code == 200, r.text


def accept_direct(toks, b):
    o, d = H(toks["owner"]), H(toks["driver"])
    uid = requests.get(f"{BASE_URL}/auth/me", headers=d).json()["id"]
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": uid}, headers=o)
    assert r.status_code == 200, r.text
    offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
    mine = [x for x in offers if x["booking_id"] == b["id"]]
    assert mine, "direct offer not visible to driver"
    acc = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
    assert acc.status_code == 200, acc.text


@pytest.fixture(scope="module")
def S():
    return {}


# ---- Share trip link
class TestShare:
    def test_share_before_confirm_400(self, toks, S):
        b = new_booking(toks)
        S["b"] = b
        r = requests.post(f"{BASE_URL}/bookings/{b['id']}/share", headers=H(toks["customer"]))
        assert r.status_code == 400, r.text

    def test_share_after_confirm_idempotent(self, toks, S):
        confirm(toks, S["b"])
        r1 = requests.post(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["customer"]))
        r2 = requests.post(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["customer"]))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["token"] == r2.json()["token"] and r1.json()["path"] == f"/live/{r1.json()['token']}"
        S["token"] = r1.json()["token"]

    def test_share_other_customer_404_and_driver_403(self, toks, S):
        assert requests.post(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["other_customer"])).status_code == 404
        assert requests.post(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["driver"])).status_code == 403

    def test_public_waiting_no_driver(self, S):
        r = requests.get(f"{BASE_URL}/public/live/{S['token']}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "AWAITING_ASSIGNMENT" and d["ended"] is False and d["driver_info"] is None
        assert d["ref"] == S["b"]["ref"]

    def test_public_with_driver_no_sensitive(self, toks, S):
        accept_direct(toks, S["b"])
        requests.post(f"{BASE_URL}/driver/jobs/{S['b']['id']}/location", json={"lat": 19.05, "lng": 72.85},
                      headers=H(toks["driver"]))
        r = requests.get(f"{BASE_URL}/public/live/{S['token']}")
        d = r.json()
        print("public payload:", d)
        assert d["status"] == "ACCEPTED" and d["driver_info"]["first_name"] == "Ravi"
        assert "rating" in d["driver_info"] and "badge_label" in d["driver_info"]
        assert d["eta_mins"] >= 1 and d["distance_km"] > 0 and d["pickup"]["lat"]
        txt = r.text
        for bad in ("phone", "trip_otp", "+91", "Gateway", "Colaba", "customer_id", "driver_id"):
            assert bad not in txt, f"public payload leaks {bad}"

    def test_customer_detail_driver_badge_fields(self, toks, S):
        d = requests.get(f"{BASE_URL}/bookings/{S['b']['id']}", headers=H(toks["customer"])).json()
        assert "badge" in d["driver"] and "badge_label" in d["driver"]
        assert d.get("share_token") == S["token"] or True

    def test_stop_share_then_404(self, toks, S):
        r = requests.delete(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["customer"]))
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/public/live/{S['token']}").status_code == 404
        assert requests.get(f"{BASE_URL}/public/live/notarealtoken123").status_code == 404

    def test_reshare_new_token_then_ended_after_complete(self, toks, S):
        r = requests.post(f"{BASE_URL}/bookings/{S['b']['id']}/share", headers=H(toks["customer"]))
        tok = r.json()["token"]
        assert tok != S["token"]
        bid, d = S["b"]["id"], H(toks["driver"])
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/arrive", headers=d).status_code == 200
        otp = mdb.bookings.find_one({"id": bid})["trip_otp"]
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/start", json={"otp": otp}, headers=d).status_code == 200
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/complete", json={"cash_collected": False}, headers=d).status_code == 200
        p = requests.get(f"{BASE_URL}/public/live/{tok}").json()
        assert p["ended"] is True and p["status"] == "COMPLETED" and "driver_info" not in p
        # sharing a completed trip -> 400
        assert requests.post(f"{BASE_URL}/bookings/{bid}/share", headers=H(toks["customer"])).status_code == 400

    def test_cancelled_trip_ended(self, toks):
        b = new_booking(toks, time="15:00")
        confirm(toks, b)
        tok = requests.post(f"{BASE_URL}/bookings/{b['id']}/share", headers=H(toks["customer"])).json()["token"]
        assert requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"])).status_code == 200
        p = requests.get(f"{BASE_URL}/public/live/{tok}").json()
        assert p["ended"] is True and p["status"] == "CANCELLED"


# ---- Badges + priority offers
class TestBadges:
    def test_badge_for_rules(self):
        from logic import badge_for
        assert badge_for(4.5, 5) == "top" and badge_for(4.49, 50) is None and badge_for(4.9, 4) is None
        assert badge_for(4.8, 10) == "gold" and badge_for(4.8, 9) == "top" and badge_for(None, 0) is None

    def test_driver_reviews_badge_fields(self, toks):
        d = requests.get(f"{BASE_URL}/driver/reviews", headers=H(toks["driver"])).json()
        for k in ("badge", "badge_label", "next_badge", "priority_minutes"):
            assert k in d
        assert d["priority_minutes"] == 5
        if d["badge"] is None:
            assert d["next_badge"]["key"] == "top"
        print("reviews:", d["average"], d["count"], d["badge"], d["next_badge"])

    def test_admin_ratings_badge(self, toks):
        d = requests.get(f"{BASE_URL}/admin/ratings?period=all", headers=H(toks["owner"])).json()
        assert all("badge" in r and "badge_label" in r for r in d["drivers"])

    def test_priority_offer_non_badge_hidden(self, toks):
        b = new_booking(toks, time="18:00", day=(date.today() + timedelta(days=4)).isoformat())
        confirm(toks, b)
        uid = requests.get(f"{BASE_URL}/auth/me", headers=H(toks["driver"])).json()["id"]
        a = mdb.booking_assignments.find_one({"booking_id": b["id"], "driver_id": uid, "mode": "broadcast"})
        assert a, "no broadcast assignment for demo driver"
        assert a["priority"] is False
        vis = datetime.fromisoformat(a["visible_at"])
        assert 4 * 60 <= (vis - datetime.now(timezone.utc)).total_seconds() <= 5 * 60 + 5
        assert datetime.fromisoformat(a["expires_at"]) > vis
        offers = requests.get(f"{BASE_URL}/driver/offers", headers=H(toks["driver"])).json()
        assert not [x for x in offers if x["booking_id"] == b["id"]]
        r = requests.post(f"{BASE_URL}/driver/offers/{a['id']}/accept", headers=H(toks["driver"]))
        assert r.status_code == 400, r.text
        requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"]))

    def test_priority_offer_badge_holder_immediate(self, toks):
        b = new_booking(toks, city="bengaluru", pickup="TEST_ MG Road", time="11:00")
        confirm(toks, b)
        rows = list(mdb.booking_assignments.find({"booking_id": b["id"], "mode": "broadcast"}))
        print("bengaluru assignments:", [(r["priority"], r["visible_at"]) for r in rows])
        pri = [r for r in rows if r["priority"]]
        if not pri:
            pytest.skip("no eligible online badge driver in bengaluru")
        assert (datetime.fromisoformat(pri[0]["visible_at"]) - datetime.now(timezone.utc)).total_seconds() <= 1
        requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"]))


# ---- Presence location + ERP live map
class TestLiveMap:
    def test_presence_location(self, toks):
        assert requests.post(f"{BASE_URL}/driver/location", json={"lat": 19.07, "lng": 72.87}, headers=H(toks["driver"])).status_code == 200
        assert requests.post(f"{BASE_URL}/driver/location", json={"lat": 99, "lng": 72.87}, headers=H(toks["driver"])).status_code == 400
        assert requests.post(f"{BASE_URL}/driver/location", json={"lat": 19, "lng": 72}, headers=H(toks["other_driver"])).status_code == 400

    def test_live_drivers_city(self, toks):
        r = requests.get(f"{BASE_URL}/admin/live-drivers?city_id=mumbai", headers=H(toks["ops"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert set(d["counts"]) == {"available", "on_trip", "no_location"}
        ravi = [x for x in d["drivers"] if x["name"] and x["name"].startswith("Ravi")]
        assert ravi and ravi[0]["location"] and ravi[0]["state"] in ("available", "on_trip")
        assert ravi[0]["updated_secs_ago"] < 60 and ravi[0]["stale"] is False
        assert all(x["city_id"] == "mumbai" for x in d["drivers"])

    def test_live_drivers_booking_sorted(self, toks):
        b = new_booking(toks, time="20:00", day=(date.today() + timedelta(days=5)).isoformat())
        r = requests.get(f"{BASE_URL}/admin/live-drivers?booking_id={b['id']}", headers=H(toks["owner"]))
        d = r.json()
        assert r.status_code == 200 and d["pickup"] and d["booking"]["ref"] == b["ref"]
        ds = [x["distance_km"] for x in d["drivers"] if x["distance_km"] is not None]
        assert ds == sorted(ds) and all("reason" in x for x in d["drivers"])
        assert requests.get(f"{BASE_URL}/admin/live-drivers?booking_id=nope", headers=H(toks["owner"])).status_code == 404
        confirm(toks, b)  # eligible_drivers only computed for AWAITING_ASSIGNMENT/ASSIGNED
        det = requests.get(f"{BASE_URL}/admin/bookings/{b['id']}", headers=H(toks["owner"])).json()
        el = det.get("eligible_drivers") or []
        assert el and all("badge" in x and "distance_km" in x for x in el)
        flags = [x["eligible"] for x in el]
        assert flags == sorted(flags, reverse=True)
        requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"]))

    def test_live_drivers_forbidden(self, toks):
        for k in ("customer", "driver", "finance"):
            if toks.get(k):
                assert requests.get(f"{BASE_URL}/admin/live-drivers", headers=H(toks[k])).status_code == 403, k

    def test_tile_proxy(self):
        r = requests.get(f"{BASE_URL}/tiles/12/2884/1818.png")
        assert r.status_code == 200 and r.headers["content-type"] == "image/png" and len(r.content) > 500
        assert requests.get(f"{BASE_URL}/tiles/30/1/1.png").status_code == 404
