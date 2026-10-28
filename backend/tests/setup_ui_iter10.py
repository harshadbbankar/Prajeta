# Iteration 10 UI seed: `python setup_ui_iter10.py setup` creates 2 TEST_ friends referred by Ananya (1 completed); `cleanup` removes them and resets Ananya's credit
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import test_referral_leaderboard as t  # noqa: E402

STATE = "/tmp/iter10_seed.json"

if sys.argv[1] == "setup":
    a = t.mdb.users.find_one({"phone": t.CUST_PHONE}, {"_id": 0})
    toks = {k: t.login(p)["token"] for k, p in {"owner": "9000000001", "driver": "9000000002"}.items()}
    fs = [t.login(t.rand_phone(), name=f"TEST_UIFriend{i+1}") for i in range(2)]
    t.mdb.otp_requests.delete_many({})
    b1 = t.book(fs[0]["token"], t.CODE, "TEST_UIFriend1")
    t.drive_to_complete(toks, b1)
    t.book(fs[1]["token"], t.CODE, "TEST_UIFriend2")
    json.dump({"friends": [f["user"]["id"] for f in fs],
               "ananya": {k: a.get(k, 0) for k in ("referral_credit", "referral_earned", "referral_bonus_given")}}, open(STATE, "w"))
    print("seeded", [f["user"]["id"] for f in fs])
else:
    s = json.load(open(STATE))
    for uid in s["friends"]:
        bids = [b["id"] for b in t.mdb.bookings.find({"customer_id": uid}, {"id": 1})]
        t.mdb.booking_assignments.delete_many({"booking_id": {"$in": bids}})
        t.mdb.payments.delete_many({"booking_id": {"$in": bids}})
        t.mdb.bookings.delete_many({"customer_id": uid})
        t.mdb.notifications.delete_many({"user_id": uid})
        t.mdb.users.delete_one({"id": uid})
    a = t.mdb.users.find_one({"phone": t.CUST_PHONE}, {"_id": 0, "id": 1})
    t.mdb.users.update_one({"id": a["id"]}, {"$set": s["ananya"]})
    t.mdb.notifications.delete_many({"user_id": a["id"], "title": {"$regex": "thank-you|Referral reward"}})
    t.mdb.audit_logs.delete_many({"action": "referral_bonus", "entity_id": a["id"]})
    print("cleaned")
