# Seed helper for iteration-4 UI test: completed-unrated booking + verify the ACCEPTED tracking booking
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("EXPO_BACKEND_URL", "https://fleetride-hub.preview.emergentagent.com")
import requests
from test_tracking_ratings_invoice import BASE_URL, H, login, new_booking, to_accepted

t = {k: login(p)["token"] for k, p in {"owner": "9000000001", "driver": "9000000002", "customer": "9000000003"}.items()}
import json; t["ops"] = login("9000000004")["token"]; json.dump(t, open("/tmp/tokens.json", "w"))
c, d = H(t["customer"]), H(t["driver"])
b = to_accepted(t, new_booking(t, pickup="TEST_ UI Nariman Point"))
requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/arrive", headers=d)
otp = requests.get(f"{BASE_URL}/bookings/{b['id']}", headers=c).json()["trip_otp"]
requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/start", json={"otp": otp}, headers=d)
print("complete:", requests.post(f"{BASE_URL}/driver/jobs/{b['id']}/complete", json={"cash_collected": True}, headers=d).json()["status"])
print("COMPLETED_ID", b["id"])
acc = "6acad2db-c249-4ce9-a6ef-9cc17a9a9799"
print("ACCEPTED status:", requests.get(f"{BASE_URL}/bookings/{acc}", headers=c).json()["status"])
print("loc post:", requests.post(f"{BASE_URL}/driver/jobs/{acc}/location", json={"lat": 19.08, "lng": 72.88}, headers=d).status_code)
print(requests.get(f"{BASE_URL}/bookings/{acc}/tracking", headers=c).json())
