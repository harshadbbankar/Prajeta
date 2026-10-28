"""Driver licence expiry reminders and automatic pausing of expired drivers."""
import asyncio
from datetime import date

from core import db, now_iso, notify, logger

REMINDER_DAYS = [30, 15, 7, 1]
CHECK_EVERY_SECONDS = 6 * 3600


def days_left(expiry: str):
    try:
        return (date.fromisoformat(expiry[:10]) - date.today()).days
    except Exception:
        return None


async def notify_verification_team(title: str, body: str):
    async for u in db.users.find({"role": {"$in": ["owner", "super_admin", "verification"]}, "restricted": {"$ne": True}},
                                 {"_id": 0, "id": 1}):
        await notify(u["id"], title, body)


async def licence_check() -> dict:
    """Idempotent: sends each reminder threshold once and pauses expired drivers once."""
    reminded = paused = 0
    async for p in db.driver_profiles.find({"status": {"$in": ["APPROVED", "SUSPENDED", "UNDER_REVIEW", "SUBMITTED"]},
                                            "licence_expiry": {"$nin": [None, ""]}}, {"_id": 0}):
        left = days_left(p["licence_expiry"])
        if left is None:
            continue
        sent = p.get("licence_reminders_sent", [])
        if left < 0:
            if not p.get("licence_expired"):
                await db.driver_profiles.update_one({"user_id": p["user_id"]},
                                                    {"$set": {"licence_expired": True, "online": False,
                                                              "licence_paused_at": now_iso()}})
                await db.booking_assignments.update_many({"driver_id": p["user_id"], "status": "OFFERED"},
                                                         {"$set": {"status": "WITHDRAWN"}})
                await notify(p["user_id"], "Licence expired — jobs paused",
                             "Your driving licence has expired. Upload your renewed licence to receive jobs again.")
                await notify_verification_team("Driver paused: licence expired",
                                               f"{p.get('name') or p['phone']}'s licence expired on {p['licence_expiry']}.")
                paused += 1
            continue
        due = [d for d in REMINDER_DAYS if left <= d and d not in sent]
        if due:
            await db.driver_profiles.update_one({"user_id": p["user_id"]},
                                                {"$set": {"licence_reminders_sent": sent + due}})
            await notify(p["user_id"], "Licence expiring soon",
                         f"Your driving licence expires in {left} day(s) on {p['licence_expiry']}. Upload the renewed licence to keep getting jobs.")
            await notify_verification_team("Licence expiring soon",
                                           f"{p.get('name') or p['phone']}'s licence expires in {left} day(s).")
            reminded += 1
    docs = await doc_check()
    return {"reminded": reminded + docs["reminded"], "paused": paused + docs["paused"]}


DOC_LABELS = {"identity": "Identity proof", "police_verification": "Police verification certificate",
              "address_proof": "Address proof"}
MANDATORY_DOCS = ("identity", "police_verification")


async def doc_check() -> dict:
    """Reminders for ID / police / address documents; expired mandatory docs pause the driver."""
    reminded = paused = 0
    async for p in db.driver_profiles.find({"status": {"$in": ["APPROVED", "SUSPENDED", "UNDER_REVIEW", "SUBMITTED"]},
                                            "documents": {"$elemMatch": {"expiry": {"$nin": [None, ""]}}}}, {"_id": 0}):
        docs = p.get("documents", [])
        expired_types = set(p.get("docs_expired", []))
        changed = False
        who = p.get("name") or p["phone"]
        for d in docs:
            if d.get("doc_type") not in DOC_LABELS or not d.get("expiry"):
                continue
            left = days_left(d["expiry"])
            if left is None:
                continue
            label = DOC_LABELS[d["doc_type"]]
            if left < 0:
                if d.get("expired_notified"):
                    continue
                d["expired_notified"] = True
                changed = True
                if d["doc_type"] in MANDATORY_DOCS:
                    expired_types.add(d["doc_type"])
                    paused += 1
                    await notify(p["user_id"], f"{label} expired — jobs paused",
                                 f"Your {label.lower()} expired on {d['expiry']}. Upload a valid copy to receive jobs again.")
                else:
                    await notify(p["user_id"], f"{label} expired", f"Please upload a valid {label.lower()}.")
                await notify_verification_team(f"{label} expired", f"{who}'s {label.lower()} expired on {d['expiry']}.")
                continue
            sent = d.get("reminders_sent", [])
            due = [x for x in REMINDER_DAYS if left <= x and x not in sent]
            if due:
                d["reminders_sent"] = sent + due
                changed = True
                reminded += 1
                await notify(p["user_id"], f"{label} expiring soon",
                             f"Your {label.lower()} expires in {left} day(s) on {d['expiry']}. Upload the renewed document in time.")
                await notify_verification_team(f"{label} expiring soon", f"{who}'s {label.lower()} expires in {left} day(s).")
        if changed:
            upd = {"documents": docs, "docs_expired": sorted(expired_types)}
            if expired_types - set(p.get("docs_expired", [])):
                upd["online"] = False
                await db.booking_assignments.update_many({"driver_id": p["user_id"], "status": "OFFERED"},
                                                         {"$set": {"status": "WITHDRAWN"}})
            await db.driver_profiles.update_one({"user_id": p["user_id"]}, {"$set": upd})
    return {"reminded": reminded, "paused": paused}


async def licence_loop():
    while True:
        try:
            await licence_check()
        except Exception as e:
            logger.error("licence check failed: %s", e)
        await asyncio.sleep(CHECK_EVERY_SECONDS)
