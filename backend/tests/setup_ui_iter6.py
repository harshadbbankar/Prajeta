# Iteration 6 UI setup: tokens for demo roles + state of the live trip used for SOS UI tests
import json
import os

import requests
from pymongo import MongoClient
from dotenv import dotenv_values

ENV = dotenv_values("/app/backend/.env")
BASE = os.environ.get("EXPO_BACKEND_URL").rstrip("/") + "/api"
mdb = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
mdb.otp_requests.delete_many({})
out = {}
for k, p in {"owner": "9000000001", "ops": "9000000004", "driver": "9000000002", "customer": "9000000003"}.items():
    requests.post(f"{BASE}/auth/otp/send", json={"phone": p})
    out[k] = requests.post(f"{BASE}/auth/otp/verify", json={"phone": p, "code": "123456"}).json()["token"]
mdb.otp_requests.delete_many({})
b = mdb.bookings.find_one({"id": "6acad2db-c249-4ce9-a6ef-9cc17a9a9799"}, {"_id": 0, "status": 1, "ref": 1, "sos_active": 1, "share_token": 1})
out["booking"] = b
out["open_sos"] = mdb.sos_alerts.count_documents({"status": {"$in": ["OPEN", "ACKNOWLEDGED"]}})
json.dump(out, open("/tmp/ui_tokens.json", "w"))
print(json.dumps(out, indent=1))
