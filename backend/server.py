from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, date, timezone, timedelta
from collections import defaultdict
import calendar as cal_mod

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

ROLE_AUTISTA = "Autista"
ROLE_CAPOTURNO = "Capoturno"
ROLE_SOCCORRITORE = "Soccorritore"

SHIFT_MATTINA = "Mattina"
SHIFT_POMERIGGIO = "Pomeriggio"
SHIFT_NOTTE = "Notte"

SHIFT_TYPES = [SHIFT_MATTINA, SHIFT_POMERIGGIO, SHIFT_NOTTE]

# Italian national holidays (month, day) - fixed dates
FIXED_HOLIDAYS = {
    (1, 1): "Capodanno",
    (1, 6): "Epifania",
    (4, 25): "Festa della Liberazione",
    (5, 1): "Festa dei Lavoratori",
    (6, 2): "Festa della Repubblica",
    (8, 15): "Ferragosto",
    (11, 1): "Ognissanti",
    (12, 8): "Immacolata",
    (12, 25): "Natale",
    (12, 26): "Santo Stefano",
}

SEED_USERS_DEMO = [  # Mantenuti come riferimento, NON più auto-seedati
    {"name": "Marco Rossi", "role": ROLE_AUTISTA},
]


# ============ MODELS ============
class User(BaseModel):
    id: str
    name: str
    role: str
    is_admin: bool = False


class Shift(BaseModel):
    id: str
    date: str  # YYYY-MM-DD
    shift_type: str  # Mattina/Pomeriggio/Notte
    user_id: str
    user_name: str
    role: str
    created_at: str


class ShiftCreate(BaseModel):
    date: str
    shift_type: str
    user_id: str


class SwapRequest(BaseModel):
    id: str
    from_user_id: str
    from_user_name: str
    to_user_id: str
    to_user_name: str
    shift_id: str
    shift_date: str
    shift_type: str
    status: str  # pending/accepted/rejected
    created_at: str
    message: Optional[str] = None


class SwapCreate(BaseModel):
    from_user_id: str
    to_user_id: str
    shift_id: str
    message: Optional[str] = None


class LeaveRequest(BaseModel):
    id: str
    user_id: str
    user_name: str
    start_date: str
    end_date: str
    reason: Optional[str] = None
    status: str  # pending/approved/rejected
    created_at: str


class LeaveCreate(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    reason: Optional[str] = None


class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    type: str  # shift/swap/leave
    read: bool = False
    created_at: str


class GenerateRequest(BaseModel):
    year: int
    month: int  # 1-12
    overwrite: bool = False


class UserCreate(BaseModel):
    name: str
    role: str
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None


class SetupMember(BaseModel):
    name: str
    role: str


class SetupPayload(BaseModel):
    members: List[SetupMember]
    admin_index: int  # index in members list who will be admin


# ============ HELPERS ============
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_holiday(d: date) -> Optional[str]:
    return FIXED_HOLIDAYS.get((d.month, d.day))


def clean_doc(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


async def ensure_seed():
    # No auto-seed: setup must be done via /api/setup
    logging.info("Startup OK - setup endpoint available at POST /api/setup")


async def create_notification(user_id: str, title: str, body: str, n_type: str):
    notif = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "body": body,
        "type": n_type,
        "read": False,
        "created_at": now_iso(),
    }
    await db.notifications.insert_one(notif.copy())


# ============ ENDPOINTS ============
@api_router.get("/")
async def root():
    return {"message": "LAPS Turni API"}


# ===== SETUP =====
VALID_ROLES = {ROLE_AUTISTA, ROLE_CAPOTURNO, ROLE_SOCCORRITORE}


@api_router.get("/setup/status")
async def setup_status():
    count = await db.users.count_documents({})
    return {"initialized": count > 0, "user_count": count}


@api_router.post("/setup")
async def setup_init(payload: SetupPayload):
    existing = await db.users.count_documents({})
    if existing > 0:
        raise HTTPException(400, "Setup già completato. Usa la gestione utenti.")
    if not payload.members:
        raise HTTPException(400, "Inserisci almeno un membro")
    if payload.admin_index < 0 or payload.admin_index >= len(payload.members):
        raise HTTPException(400, "Indice admin non valido")
    for m in payload.members:
        if m.role not in VALID_ROLES:
            raise HTTPException(400, f"Ruolo non valido: {m.role}")
        if not m.name.strip():
            raise HTTPException(400, "Il nome non può essere vuoto")
    docs = []
    for idx, m in enumerate(payload.members):
        docs.append({
            "id": str(uuid.uuid4()),
            "name": m.name.strip(),
            "role": m.role,
            "is_admin": idx == payload.admin_index,
        })
    await db.users.insert_many(docs)
    return {"ok": True, "created": len(docs)}


@api_router.post("/setup/reset")
async def setup_reset():
    """Wipes ALL data (users, shifts, swaps, leaves, notifications). Irreversibile."""
    await db.users.delete_many({})
    await db.shifts.delete_many({})
    await db.swaps.delete_many({})
    await db.leaves.delete_many({})
    await db.notifications.delete_many({})
    return {"ok": True}


@api_router.get("/users", response_model=List[User])
async def list_users():
    users = await db.users.find({}, {"_id": 0}).to_list(100)
    return [User(**u) for u in users]


@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return User(**u)


@api_router.post("/users", response_model=User)
async def create_user(payload: UserCreate):
    if payload.role not in VALID_ROLES:
        raise HTTPException(400, "Ruolo non valido")
    if not payload.name.strip():
        raise HTTPException(400, "Il nome non può essere vuoto")
    user = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "role": payload.role,
        "is_admin": False,  # Admin transfer via dedicated endpoint
    }
    await db.users.insert_one(user.copy())
    return User(**user)


@api_router.patch("/users/{user_id}", response_model=User)
async def update_user(user_id: str, payload: UserUpdate):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    updates = {}
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(400, "Nome vuoto")
        updates["name"] = payload.name.strip()
    if payload.role is not None:
        if payload.role not in VALID_ROLES:
            raise HTTPException(400, "Ruolo non valido")
        updates["role"] = payload.role
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        # Propagate name/role to denormalized fields
        if "name" in updates:
            await db.shifts.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
            await db.swaps.update_many({"from_user_id": user_id}, {"$set": {"from_user_name": updates["name"]}})
            await db.swaps.update_many({"to_user_id": user_id}, {"$set": {"to_user_name": updates["name"]}})
            await db.leaves.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
        if "role" in updates:
            await db.shifts.update_many({"user_id": user_id}, {"$set": {"role": updates["role"]}})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return User(**user)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if user.get("is_admin"):
        raise HTTPException(400, "Non puoi eliminare l'amministratore. Trasferisci prima il ruolo admin.")
    # Delete user + future shifts + their swaps/leaves/notifications
    today = date.today().isoformat()
    await db.users.delete_one({"id": user_id})
    await db.shifts.delete_many({"user_id": user_id, "date": {"$gte": today}})
    await db.swaps.delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}], "status": "pending"})
    await db.leaves.delete_many({"user_id": user_id, "status": "pending"})
    await db.notifications.delete_many({"user_id": user_id})
    return {"ok": True}


# ===== SHIFTS =====
@api_router.get("/shifts", response_model=List[Shift])
async def list_shifts(month: Optional[str] = None, user_id: Optional[str] = None, date_str: Optional[str] = None):
    query = {}
    if month:
        # month format YYYY-MM
        query["date"] = {"$regex": f"^{month}"}
    if user_id:
        query["user_id"] = user_id
    if date_str:
        query["date"] = date_str
    shifts = await db.shifts.find(query, {"_id": 0}).sort("date", 1).to_list(2000)
    return [Shift(**s) for s in shifts]


@api_router.post("/shifts", response_model=Shift)
async def create_shift(payload: ShiftCreate):
    if payload.shift_type not in SHIFT_TYPES:
        raise HTTPException(400, "Tipo turno non valido")
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    shift = {
        "id": str(uuid.uuid4()),
        "date": payload.date,
        "shift_type": payload.shift_type,
        "user_id": payload.user_id,
        "user_name": user["name"],
        "role": user["role"],
        "created_at": now_iso(),
    }
    await db.shifts.insert_one(shift.copy())
    await create_notification(
        payload.user_id,
        "Nuovo turno assegnato",
        f"Sei stato assegnato al turno {payload.shift_type} del {payload.date}",
        "shift",
    )
    return Shift(**shift)


@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str):
    result = await db.shifts.delete_one({"id": shift_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Turno non trovato")
    return {"ok": True}


@api_router.post("/shifts/generate")
async def generate_shifts(req: GenerateRequest):
    """Generate shifts for a month with fair rotation."""
    year, month = req.year, req.month
    # Days in month
    _, num_days = cal_mod.monthrange(year, month)
    month_prefix = f"{year:04d}-{month:02d}"

    if req.overwrite:
        await db.shifts.delete_many({"date": {"$regex": f"^{month_prefix}"}})
    else:
        existing = await db.shifts.count_documents({"date": {"$regex": f"^{month_prefix}"}})
        if existing > 0:
            raise HTTPException(400, "Turni già esistenti. Usa overwrite=true per sovrascrivere.")

    users = await db.users.find({}, {"_id": 0}).to_list(100)
    autisti = [u for u in users if u["role"] == ROLE_AUTISTA]
    capoturni = [u for u in users if u["role"] == ROLE_CAPOTURNO]
    soccorritori = [u for u in users if u["role"] == ROLE_SOCCORRITORE]

    # Get historical loads for fair rotation (across all years)
    all_shifts = await db.shifts.find({}, {"_id": 0}).to_list(100000)
    total_load = defaultdict(int)
    holiday_load = defaultdict(int)
    for s in all_shifts:
        total_load[s["user_id"]] += 1
        try:
            d = date.fromisoformat(s["date"])
            if is_holiday(d):
                holiday_load[s["user_id"]] += 1
        except Exception:
            pass

    # Approved leaves to skip
    leaves = await db.leaves.find({"status": "approved"}, {"_id": 0}).to_list(1000)

    def is_on_leave(uid: str, d: date) -> bool:
        for lv in leaves:
            if lv["user_id"] != uid:
                continue
            try:
                start = date.fromisoformat(lv["start_date"])
                end = date.fromisoformat(lv["end_date"])
                if start <= d <= end:
                    return True
            except Exception:
                continue
        return False

    created = []
    busy_today = defaultdict(set)  # date_str -> set of user_ids already assigned that day
    rest_until = defaultdict(str)  # user_id -> date_str (inclusive) when they can work again (smontante+riposo)

    def is_resting(uid: str, d: date) -> bool:
        until = rest_until.get(uid)
        return bool(until) and d.isoformat() <= until

    def pick_user(pool, d: date, holiday: bool):
        # Filter: not on leave, not already working today, not in smontante/riposo
        d_iso = d.isoformat()
        candidates = [u for u in pool if not is_on_leave(u["id"], d) and u["id"] not in busy_today[d_iso] and not is_resting(u["id"], d)]
        if not candidates:
            candidates = [u for u in pool if not is_on_leave(u["id"], d) and u["id"] not in busy_today[d_iso]]
        if not candidates:
            candidates = [u for u in pool if not is_on_leave(u["id"], d)]
        if not candidates:
            candidates = pool[:]
        if holiday:
            candidates.sort(key=lambda u: (holiday_load[u["id"]], total_load[u["id"]], u["name"]))
        else:
            candidates.sort(key=lambda u: (total_load[u["id"]], u["name"]))
        return candidates[0]

    for day in range(1, num_days + 1):
        d = date(year, month, day)
        d_str = d.isoformat()
        holiday = is_holiday(d) is not None

        for shift_type in SHIFT_TYPES:
            # Each shift: 1 Autista, 1 Capoturno, 1 Soccorritore (3 persone)
            assignments = []
            a = pick_user(autisti, d, holiday)
            assignments.append((a, shift_type))
            busy_today[d_str].add(a["id"])

            c = pick_user(capoturni, d, holiday)
            assignments.append((c, shift_type))
            busy_today[d_str].add(c["id"])

            s = pick_user(soccorritori, d, holiday)
            assignments.append((s, shift_type))
            busy_today[d_str].add(s["id"])

            # If Notte: next 2 days are Smontante + Riposo
            if shift_type == SHIFT_NOTTE:
                rest_end = (d + timedelta(days=2)).isoformat()
                for user, _ in assignments:
                    rest_until[user["id"]] = rest_end

            for user, st in assignments:
                shift = {
                    "id": str(uuid.uuid4()),
                    "date": d_str,
                    "shift_type": st,
                    "user_id": user["id"],
                    "user_name": user["name"],
                    "role": user["role"],
                    "created_at": now_iso(),
                }
                created.append(shift)
                total_load[user["id"]] += 1
                if holiday:
                    holiday_load[user["id"]] += 1

    if created:
        await db.shifts.insert_many([s.copy() for s in created])

    return {"created": len(created), "month": month_prefix}


# ===== SWAPS =====
@api_router.get("/swaps", response_model=List[SwapRequest])
async def list_swaps(user_id: Optional[str] = None):
    query = {}
    if user_id:
        query = {"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]}
    swaps = await db.swaps.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [SwapRequest(**s) for s in swaps]


@api_router.post("/swaps", response_model=SwapRequest)
async def create_swap(payload: SwapCreate):
    from_user = await db.users.find_one({"id": payload.from_user_id}, {"_id": 0})
    to_user = await db.users.find_one({"id": payload.to_user_id}, {"_id": 0})
    shift = await db.shifts.find_one({"id": payload.shift_id}, {"_id": 0})
    if not from_user or not to_user:
        raise HTTPException(404, "Utente non trovato")
    if not shift:
        raise HTTPException(404, "Turno non trovato")
    if from_user["role"] != to_user["role"]:
        raise HTTPException(400, "Lo scambio è possibile solo tra colleghi dello stesso ruolo")

    swap = {
        "id": str(uuid.uuid4()),
        "from_user_id": payload.from_user_id,
        "from_user_name": from_user["name"],
        "to_user_id": payload.to_user_id,
        "to_user_name": to_user["name"],
        "shift_id": payload.shift_id,
        "shift_date": shift["date"],
        "shift_type": shift["shift_type"],
        "status": "pending",
        "created_at": now_iso(),
        "message": payload.message,
    }
    await db.swaps.insert_one(swap.copy())
    await create_notification(
        payload.to_user_id,
        "Richiesta scambio turno",
        f"{from_user['name']} ti chiede di scambiare il turno {shift['shift_type']} del {shift['date']}",
        "swap",
    )
    return SwapRequest(**swap)


@api_router.patch("/swaps/{swap_id}")
async def respond_swap(swap_id: str, action: str):
    if action not in ["accept", "reject"]:
        raise HTTPException(400, "Azione non valida")
    swap = await db.swaps.find_one({"id": swap_id}, {"_id": 0})
    if not swap:
        raise HTTPException(404, "Scambio non trovato")
    if swap["status"] != "pending":
        raise HTTPException(400, "Scambio già processato")

    new_status = "accepted" if action == "accept" else "rejected"
    await db.swaps.update_one({"id": swap_id}, {"$set": {"status": new_status}})

    if action == "accept":
        # Transfer the shift to the recipient
        to_user = await db.users.find_one({"id": swap["to_user_id"]}, {"_id": 0})
        await db.shifts.update_one(
            {"id": swap["shift_id"]},
            {"$set": {"user_id": to_user["id"], "user_name": to_user["name"]}},
        )

    await create_notification(
        swap["from_user_id"],
        f"Scambio {('accettato' if action == 'accept' else 'rifiutato')}",
        f"{swap['to_user_name']} ha {('accettato' if action == 'accept' else 'rifiutato')} il tuo scambio",
        "swap",
    )
    return {"ok": True, "status": new_status}


# ===== LEAVES =====
@api_router.get("/leaves", response_model=List[LeaveRequest])
async def list_leaves(user_id: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if user_id:
        query["user_id"] = user_id
    if status:
        query["status"] = status
    leaves = await db.leaves.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [LeaveRequest(**lv) for lv in leaves]


@api_router.post("/leaves", response_model=LeaveRequest)
async def create_leave(payload: LeaveCreate):
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    leave = {
        "id": str(uuid.uuid4()),
        "user_id": payload.user_id,
        "user_name": user["name"],
        "start_date": payload.start_date,
        "end_date": payload.end_date,
        "reason": payload.reason,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.leaves.insert_one(leave.copy())
    # Notify all members of same role group + admin (so admin always knows)
    same_role = await db.users.find({"role": user["role"], "id": {"$ne": user["id"]}}, {"_id": 0}).to_list(50)
    notified_ids = set()
    for member in same_role:
        await create_notification(
            member["id"],
            "Richiesta ferie da collega",
            f"{user['name']} ha richiesto ferie dal {payload.start_date} al {payload.end_date}",
            "leave",
        )
        notified_ids.add(member["id"])
    # Also notify admin if not already notified and not the requester
    admins = await db.users.find({"is_admin": True}, {"_id": 0}).to_list(10)
    for adm in admins:
        if adm["id"] in notified_ids or adm["id"] == user["id"]:
            continue
        await create_notification(
            adm["id"],
            "Richiesta ferie da approvare",
            f"{user['name']} ({user['role']}) ha richiesto ferie dal {payload.start_date} al {payload.end_date}",
            "leave",
        )
    return LeaveRequest(**leave)


@api_router.patch("/leaves/{leave_id}")
async def respond_leave(leave_id: str, action: str):
    if action not in ["approve", "reject"]:
        raise HTTPException(400, "Azione non valida")
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Richiesta non trovata")
    new_status = "approved" if action == "approve" else "rejected"
    await db.leaves.update_one({"id": leave_id}, {"$set": {"status": new_status}})
    await create_notification(
        leave["user_id"],
        f"Ferie {('approvate' if action == 'approve' else 'rifiutate')}",
        f"La tua richiesta dal {leave['start_date']} al {leave['end_date']} è stata {new_status}",
        "leave",
    )
    return {"ok": True, "status": new_status}


# ===== NOTIFICATIONS =====
@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(user_id: str):
    notifs = await db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Notification(**n) for n in notifs]


@api_router.patch("/notifications/{notif_id}/read")
async def mark_read(notif_id: str):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read": True}})
    return {"ok": True}


@api_router.post("/notifications/mark-all-read")
async def mark_all_read(user_id: str):
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ===== STATS =====
@api_router.get("/stats/{user_id}")
async def user_stats(user_id: str, year: Optional[int] = None):
    query = {"user_id": user_id}
    if year:
        query["date"] = {"$regex": f"^{year:04d}"}
    shifts = await db.shifts.find(query, {"_id": 0}).to_list(5000)

    by_type = {SHIFT_MATTINA: 0, SHIFT_POMERIGGIO: 0, SHIFT_NOTTE: 0}
    holidays_worked = []
    total_hours = 0
    for s in shifts:
        if s["shift_type"] in by_type:
            by_type[s["shift_type"]] += 1
        # Hours: Mattina/Pomeriggio = 6h, Notte = 12h
        total_hours += 12 if s["shift_type"] == SHIFT_NOTTE else 6
        try:
            d = date.fromisoformat(s["date"])
            h = is_holiday(d)
            if h:
                holidays_worked.append({"date": s["date"], "name": h, "shift": s["shift_type"]})
        except Exception:
            pass

    return {
        "total_shifts": len(shifts),
        "by_type": by_type,
        "total_hours": total_hours,
        "holidays_worked": holidays_worked,
    }


# ===== EXPORT =====
@api_router.get("/export/{month}")
async def export_csv(month: str):
    """month: YYYY-MM"""
    shifts = await db.shifts.find({"date": {"$regex": f"^{month}"}}, {"_id": 0}).sort("date", 1).to_list(5000)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(["Data", "Turno", "Orario", "Ruolo", "Nome"])
    times = {SHIFT_MATTINA: "08:00-14:00", SHIFT_POMERIGGIO: "14:00-20:00", SHIFT_NOTTE: "20:00-08:00"}
    for s in shifts:
        writer.writerow([s["date"], s["shift_type"], times.get(s["shift_type"], ""), s["role"], s["user_name"]])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=turni_{month}.csv"},
    )


# ===== HOLIDAYS =====
@api_router.get("/holidays")
async def list_holidays(year: int):
    result = []
    for (m, d), name in FIXED_HOLIDAYS.items():
        result.append({"date": f"{year:04d}-{m:02d}-{d:02d}", "name": name})
    result.sort(key=lambda x: x["date"])
    return result


# ===== ADMIN MANAGEMENT =====
@api_router.patch("/users/{user_id}/admin")
async def set_admin(user_id: str, value: bool):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if value:
        # Only one admin at a time: clear others
        await db.users.update_many({"is_admin": True}, {"$set": {"is_admin": False}})
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": value}})
    return {"ok": True}


# ===== ADMIN: delete month =====
@api_router.delete("/shifts/month/{month}")
async def delete_month(month: str):
    result = await db.shifts.delete_many({"date": {"$regex": f"^{month}"}})
    return {"deleted": result.deleted_count}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await ensure_seed()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
