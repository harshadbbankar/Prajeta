# Iteration 4: live tracking (driver location + customer tracking), ratings & reviews (tags, driver reviews, ERP leaderboard), invoice receipt
import os
import re
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
# random future day avoids clashing with leftover active trips of the demo driver (driver_conflict)
import random  # noqa: E402
TOMORROW = (date.today() + timedelta(days=random.randint(30, 900))).isoformat()


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
    t = {k: login(p)["token"] for k, p in
         {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003"}.items()}
    t["other_customer"] = login("97" + str(uuid.uuid4().int)[:8], "customer")["token"]
    t["other_driver"] = login("96" + str(uuid.uuid4().int)[:8], "driver")["token"]
    try:
        t["finance"] = login("9111111111")["token"]
    except AssertionError:
        t["finance"] = None
    return t


def new_booking(toks, pickup="TEST_ Gateway of India, Colaba", destination=None, service="hourly"):
    body = {"service_id": service, "city_id": "mumbai", "pickup": pickup, "date": TOMORROW, "time": "10:00",
            "hours": 4, "idempotency_key": str(uuid.uuid4())}
    if destination:
        body["destination"] = destination
    r = requests.post(f"{BASE_URL}/bookings", json=body, headers=H(toks["customer"]))
    assert r.status_code == 200, r.text
    return r.json()


def to_accepted(toks, b):
    o, d = H(toks["owner"]), H(toks["driver"])
    r = requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/cash", json={"amount": b["fare"]["advance"], "reference": "TEST"}, headers=o)
    assert r.status_code == 200, r.text
    offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
    mine = [x for x in offers if x["booking_id"] == b["id"]]
    if not mine:
        uid = requests.get(f"{BASE_URL}/auth/me", headers=d).json()["id"]
        requests.post(f"{BASE_URL}/admin/bookings/{b['id']}/assign", json={"driver_id": uid}, headers=o)
        offers = requests.get(f"{BASE_URL}/driver/offers", headers=d).json()
        mine = [x for x in offers if x["booking_id"] == b["id"]]
    assert mine, "no offer for demo driver"
    acc = requests.post(f"{BASE_URL}/driver/offers/{mine[0]['id']}/accept", headers=d)
    assert acc.status_code == 200 and acc.json()["status"] == "ACCEPTED", acc.text
    return requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=H(toks["customer"])).json()


@pytest.fixture(scope="module")
def trip(toks):
    b = new_booking(toks)
    return {"pending": b}


# ---- Driver location sharing + customer tracking
class TestTracking:
    def test_location_rejected_before_accept(self, toks, trip):
        b = trip["pending"]
        r = requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/location", json={"lat": 19.0, "lng": 72.8}, headers=H(toks["driver"]))
        # booking not assigned to driver yet -> 404
        assert r.status_code == 404, r.text

    def test_tracking_inactive_pending(self, toks, trip):
        r = requests.get(f"{BASE_URL}/bookings/{trip['pending']['id']}/tracking", headers=H(toks["customer"]))
        assert r.status_code == 200 and r.json()["active"] is False and r.json()["status"] == "PAYMENT_PENDING"

    def test_accept_and_tracking_no_location(self, toks, trip):
        det = to_accepted(toks, trip["pending"])
        trip["b"] = det
        r = requests.get(f"{BASE_URL}/bookings/{det['id']}/tracking", headers=H(toks["customer"]))
        d = r.json()
        assert r.status_code == 200 and d["active"] is True and d["status"] == "ACCEPTED"
        assert d["driver"] is None and d["eta_mins"] is None and d["stale"] is True
        assert d["pickup"] and isinstance(d["pickup"]["lat"], float) and "approx" in d["pickup"]
        print("pickup geocode:", d["pickup"])

    def test_invalid_latlng(self, toks, trip):
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location", json={"lat": 120, "lng": 72.8}, headers=H(toks["driver"]))
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location", json={"lat": 19, "lng": 200}, headers=H(toks["driver"]))
        assert r.status_code == 400
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location", json={"lat": "abc", "lng": 72}, headers=H(toks["driver"]))
        assert r.status_code in (400, 422)

    def test_other_driver_404(self, toks, trip):
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location", json={"lat": 19.08, "lng": 72.88}, headers=H(toks["other_driver"]))
        assert r.status_code == 404, r.text

    def test_customer_cannot_post_location(self, toks, trip):
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location", json={"lat": 19.08, "lng": 72.88}, headers=H(toks["customer"]))
        assert r.status_code == 403

    def test_post_location_and_eta(self, toks, trip):
        r = requests.post(f"{BASE_URL}/driver/jobs/{trip['b']['id']}/location",
                          json={"lat": 19.08, "lng": 72.88, "heading": 90, "speed": 5, "accuracy": 10}, headers=H(toks["driver"]))
        assert r.status_code == 200 and r.json()["ok"] is True
        d = requests.get(f"{BASE_URL}/bookings/{trip['b']['id']}/tracking", headers=H(toks["customer"])).json()
        assert d["driver"]["lat"] == 19.08 and d["driver"]["lng"] == 72.88 and d["driver"]["heading"] == 90
        assert d["target"] == "pickup" and d["distance_km"] > 0 and d["eta_mins"] >= 1
        assert d["stale"] is False and d["updated_secs_ago"] <= 60
        print("tracking:", d)

    def test_tracking_other_customer_and_staff(self, toks, trip):
        bid = trip["b"]["id"]
        assert requests.get(f"{BASE_URL}/bookings/{bid}/tracking", headers=H(toks["other_customer"])).status_code in (403, 404)
        assert requests.get(f"{BASE_URL}/bookings/{bid}/tracking", headers=H(toks["driver"])).status_code in (403, 404)
        assert requests.get(f"{BASE_URL}/bookings/{bid}/tracking").status_code == 401

    def test_arrived_then_in_progress(self, toks, trip):
        d, c = H(toks["driver"]), H(toks["customer"])
        bid = trip["b"]["id"]
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/arrive", headers=d).json()["status"] == "DRIVER_ARRIVED"
        t = requests.get(f"{BASE_URL}/bookings/{bid}/tracking", headers=c).json()
        assert t["active"] and t["status"] == "DRIVER_ARRIVED" and t["eta_mins"] is None
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/location", json={"lat": 19.0, "lng": 72.83}, headers=d).status_code == 200
        otp = requests.get(f"{BASE_URL}/bookings/{bid}", headers=c).json()["trip_otp"]
        assert requests.post(f"{BASE_URL}/driver/jobs/{bid}/start", json={"otp": otp}, headers=d).json()["status"] == "IN_PROGRESS"
        t = requests.get(f"{BASE_URL}/bookings/{bid}/tracking", headers=c).json()
        assert t["active"] and t["status"] == "IN_PROGRESS"
        # hourly with no destination -> no target/eta
        print("in-progress tracking:", t)

    def test_complete_then_inactive(self, toks, trip):
        bid = trip["b"]["id"]
        end_pin = requests.get(f"{BASE_URL}/bookings/{bid}", headers=H(toks["customer"])).json().get("end_otp", "")  # trip-end PIN (iter11)
        comp = requests.post(f"{BASE_URL}/driver/jobs/{bid}/complete", json={"cash_collected": False, "end_pin": end_pin}, headers=H(toks["driver"]))
        assert comp.json()["status"] == "COMPLETED", comp.text
        t = requests.get(f"{BASE_URL}/bookings/{bid}/tracking", headers=H(toks["customer"])).json()
        assert t["active"] is False and t["status"] == "COMPLETED"
        r = requests.post(f"{BASE_URL}/driver/jobs/{bid}/location", json={"lat": 19.0, "lng": 72.83}, headers=H(toks["driver"]))
        assert r.status_code == 400


# ---- Invoice receipt (advance / balance rows + stamp)
class TestInvoice:
    def test_invoice_advance_paid(self, toks, trip):
        bid = trip["b"]["id"]
        r = requests.get(f"{BASE_URL}/invoices/{bid}", headers=H(toks["customer"]))
        assert r.status_code == 200
        h = r.text
        for i in ("advance-due", "advance-paid", "balance-paid", "balance-remaining"):
            assert f"id={i}" in h, i
        assert "Booking advance (20%)" in h and "Remaining balance" in h
        det = requests.get(f"{BASE_URL}/bookings/{bid}", headers=H(toks["customer"])).json()
        print("balance_due after non-cash complete:", det.get("balance_due"), det.get("payment_status"))
        stamp = re.search(r"id=stamp>([^<]+)<", h).group(1)
        assert stamp == ("PAID IN FULL" if det.get("balance_due", 0) <= 0 else "ADVANCE PAID"), stamp

    def test_invoice_query_token(self, toks, trip):
        r = requests.get(f"{BASE_URL}/invoices/{trip['b']['id']}", params={"token": toks["customer"]})
        assert r.status_code == 200 and "id=stamp" in r.text

    def test_invoice_unpaid_and_forbidden(self, toks):
        b = new_booking(toks)
        r = requests.get(f"{BASE_URL}/invoices/{b['id']}", headers=H(toks["customer"]))
        assert r.status_code == 200 and "id=stamp>UNPAID<" in r.text
        assert requests.get(f"{BASE_URL}/invoices/{b['id']}", headers=H(toks["other_customer"])).status_code == 404
        assert requests.get(f"{BASE_URL}/invoices/{b['id']}").status_code == 401
        assert requests.get(f"{BASE_URL}/invoices/{b['id']}", params={"token": "bad"}).status_code == 401
        requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"]))


# ---- Reviews with tags, driver reviews, ERP leaderboard
class TestRatings:
    def test_review_before_complete_rejected(self, toks):
        b = new_booking(toks)
        r = requests.post(f"{BASE_URL}/bookings/{b['id']}/review", json={"rating": 5}, headers=H(toks["customer"]))
        assert r.status_code == 400
        requests.post(f"{BASE_URL}/bookings/{b['id']}/cancel", json={"reason": "TEST"}, headers=H(toks["customer"]))

    def test_review_tags_and_duplicate(self, toks, trip):
        bid = trip["b"]["id"]
        c = H(toks["customer"])
        assert requests.post(f"{BASE_URL}/bookings/{bid}/review", json={"rating": 7}, headers=c).status_code == 400
        r = requests.post(f"{BASE_URL}/bookings/{bid}/review",
                          json={"rating": 2, "comment": "TEST_ late", "tags": ["Polite", "Hacker", "Punctual"]}, headers=c)
        assert r.status_code == 200, r.text
        det = requests.get(f"{BASE_URL}/bookings/{bid}", headers=c).json()
        assert det["review"]["rating"] == 2 and sorted(det["review"]["tags"]) == ["Polite", "Punctual"]
        assert requests.post(f"{BASE_URL}/bookings/{bid}/review", json={"rating": 5}, headers=c).status_code == 400

    def test_driver_notified(self, toks):
        n = requests.get(f"{BASE_URL}/notifications", headers=H(toks["driver"]))
        if n.status_code != 200:
            pytest.skip(f"notifications endpoint {n.status_code}")
        items = n.json() if isinstance(n.json(), list) else n.json().get("items", [])
        assert any("2★" in (i.get("title") or "") for i in items), items[:3]

    def test_admin_low_rating_notified(self, toks):
        n = requests.get(f"{BASE_URL}/notifications", headers=H(toks["owner"]))
        items = n.json() if isinstance(n.json(), list) else n.json().get("items", [])
        assert any("Low driver rating" in (i.get("title") or "") for i in items)

    def test_driver_reviews(self, toks):
        r = requests.get(f"{BASE_URL}/driver/reviews", headers=H(toks["driver"]))
        assert r.status_code == 200
        d = r.json()
        assert d["count"] >= 1 and isinstance(d["average"], (int, float))
        assert set(d["distribution"]) == {"1", "2", "3", "4", "5"} and sum(d["distribution"].values()) == d["count"]
        assert d["recent"][0]["rating"] == 2 and "Polite" in d["recent"][0]["tags"]
        assert any(t[0] == "Polite" for t in d["top_tags"])
        assert requests.get(f"{BASE_URL}/driver/reviews", headers=H(toks["customer"])).status_code == 403

    def test_admin_ratings_leaderboard(self, toks):
        for role in ("owner", "ops"):
            for period in ("30d", "all"):
                r = requests.get(f"{BASE_URL}/admin/ratings", params={"period": period}, headers=H(toks[role]))
                assert r.status_code == 200, (role, period, r.text)
                d = r.json()
                assert d["total_reviews"] >= 1 and d["average"] is not None
                scores = [x["score"] for x in d["drivers"]]
                assert scores == sorted(scores, reverse=True)
                assert any(l["rating"] <= 2 for l in d["low_ratings"])
        print("leaderboard top:", d["drivers"][:2])

    def test_admin_ratings_forbidden(self, toks):
        assert requests.get(f"{BASE_URL}/admin/ratings", headers=H(toks["customer"])).status_code == 403
        assert requests.get(f"{BASE_URL}/admin/ratings", headers=H(toks["driver"])).status_code == 403
        if toks["finance"]:
            me = requests.get(f"{BASE_URL}/auth/me", headers=H(toks["finance"])).json()
            if me.get("role") == "finance":
                assert requests.get(f"{BASE_URL}/admin/ratings", headers=H(toks["finance"])).status_code == 403

    def test_admin_ratings_bad_period(self, toks):
        r = requests.get(f"{BASE_URL}/admin/ratings", params={"period": "xyz"}, headers=H(toks["owner"]))
        print("bad period:", r.status_code, r.text[:150])
        assert r.status_code in (200, 400, 422)
