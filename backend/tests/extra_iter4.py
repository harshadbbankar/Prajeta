# Extra iteration-4 checks: destination ETA during IN_PROGRESS, finance role forbidden on ratings, stale flag
import os, sys, json
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("EXPO_BACKEND_URL", "https://fleetride-hub.preview.emergentagent.com")
import requests
from test_tracking_ratings_invoice import BASE_URL, H, login, new_booking, to_accepted

t = json.load(open("/tmp/tokens.json"))
c, d = H(t["customer"]), H(t["driver"])
cfg = {"services": [{"id": "pickup-drop"}]}
svcs = [(s.get("id"), s.get("needs_destination") or s.get("requires_destination") or s.get("kind")) for s in cfg.get("services", [])]
print("services:", svcs)
dest_svc = next((s["id"] for s in cfg.get("services", []) if "one" in s["id"] or "outstation" in s["id"] or "drop" in s["id"]), None)
print("dest service:", dest_svc)
if dest_svc:
    body_ok = True
    try:
        b = new_booking(t, pickup="Bandra West", destination="Powai", service=dest_svc)
    except AssertionError as e:
        body_ok = False
        print("booking failed:", e)
    if body_ok:
        b = to_accepted(t, b)
        requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", headers=d)
        otp = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()["trip_otp"]
        print("start:", requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d).json().get("status"))
        requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/location", json={"lat": 19.06, "lng": 72.83}, headers=d)
        print("IN_PROGRESS tracking:", requests.get(f"{BASE_URL}/bookings/{b['id']}/tracking", headers=c).json())
        print("IN_PROGRESS_ID", b["id"])
fin = login("9111111111")["token"]
me = requests.get(f"{BASE_URL}/auth/me", headers=H(fin)).json()
print("finance role:", me.get("role"), "ratings:", requests.get(f"{BASE_URL}/admin/ratings", headers=H(fin)).status_code)
