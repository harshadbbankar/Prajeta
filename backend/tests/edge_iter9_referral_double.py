# Iteration 9 edge probe: can a new customer stack the referral code on 2 pending bookings (double referrer reward risk)?
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from test_referral_payout_statement import login, book, mdb, H, BASE_URL  # noqa
import random, requests

phone = "9" + "".join(random.choice("0123456789") for _ in range(9))
d = login(phone)
try:
    b1 = book(d["token"], "PRJ8YK6Z")
    b2 = book(d["token"], "PRJ8YK6Z")
    print("b1 referral:", mdb.bookings.find_one({"id": b1["id"]})["referral"])
    print("b2 referral:", mdb.bookings.find_one({"id": b2["id"]})["referral"])
    me = requests.get(f"{BASE_URL}/me/referral", headers=H(login("9000000003")["token"])).json()
    print("ananya friends_joined:", me["friends_joined"])
finally:
    mdb.bookings.delete_many({"customer_id": d["user"]["id"]})
    mdb.users.delete_one({"id": d["user"]["id"]})
    mdb.otp_requests.delete_many({})
