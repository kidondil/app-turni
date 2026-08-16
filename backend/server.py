from fastapi import FastAPI, APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import logging
from pathlib import Path
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Literal
import uuid
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, date, timezone, timedelta
from collections import defaultdict
import calendar as cal_mod
from contextlib import asynccontextmanager
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_seed()
    await db.sessions.delete_many({"expires_at": {"$lte": now_iso()}})
    if not PIN_PEPPER:
        logging.warning("PIN_PEPPER non configurato: impostalo prima della pubblicazione")
    yield
    client.close()


app = FastAPI(title="LAPS Turni API", version="1.1.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

ROLE_AUTISTA = "Autista"
ROLE_CAPOTURNO = "Capoturno"
ROLE_SOCCORRITORE = "Soccorritore"

SHIFT_MATTINA = "Mattina"
SHIFT_POMERIGGIO = "Pomeriggio"
SHIFT_NOTTE = "Notte"

SHIFT_TYPES = [SHIFT_MATTINA, SHIFT_POMERIGGIO, SHIFT_NOTTE]
ITALY_TZ = ZoneInfo("Europe/Rome")
SESSION_DAYS = 30
PIN_HASH_ITERATIONS = 210_000
PIN_PEPPER = os.getenv("PIN_PEPPER", "")
PIN_BOOTSTRAP_KEY = os.getenv("PIN_BOOTSTRAP_KEY", "")

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
    shift_type: Literal["Mattina", "Pomeriggio", "Notte"]
    user_id: str

    @field_validator("date")
    @classmethod
    def validate_date(cls, value: str) -> str:
        return validate_iso_date(value)


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

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_dates(cls, value: str) -> str:
        return validate_iso_date(value)

    @model_validator(mode="after")
    def validate_range(self):
        if self.start_date > self.end_date:
            raise ValueError("La data di inizio deve precedere o coincidere con quella di fine")
        return self


class Notification(BaseModel):
    id: str
    user_id: str
    title: str
    body: str
    type: str  # shift/swap/leave
    read: bool = False
    created_at: str


class GenerateRequest(BaseModel):
    year: int = Field(ge=2020, le=2100)
    month: int = Field(ge=1, le=12)
    overwrite: bool = False


class UserCreate(BaseModel):
    name: str
    role: str
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        return normalize_pin(value)


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None


class SetupMember(BaseModel):
    name: str
    role: str
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        return normalize_pin(value)


class SetupPayload(BaseModel):
    members: List[SetupMember]
    admin_index: int  # index in members list who will be admin


class LoginPayload(BaseModel):
    user_id: str
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        return normalize_pin(value)


class ChangePinPayload(BaseModel):
    current_pin: str
    new_pin: str

    @field_validator("current_pin", "new_pin")
    @classmethod
    def validate_pins(cls, value: str) -> str:
        return normalize_pin(value)


class ResetPinPayload(BaseModel):
    new_pin: str

    @field_validator("new_pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        return normalize_pin(value)


class BootstrapPinMember(BaseModel):
    user_id: str
    pin: str

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, value: str) -> str:
        return normalize_pin(value)


class BootstrapPinsPayload(BaseModel):
    bootstrap_key: str
    members: List[BootstrapPinMember]


# ============ HELPERS ============
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_italy() -> date:
    return datetime.now(ITALY_TZ).date()


def normalize_pin(value: str) -> str:
    if not isinstance(value, str) or not value.isdigit() or not 4 <= len(value) <= 6:
        raise ValueError("Il PIN deve contenere da 4 a 6 cifre")
    return value


def ensure_pin_security_configured():
    if not PIN_PEPPER:
        raise HTTPException(503, "Configura PIN_PEPPER sul server prima di usare i PIN")


def hash_pin(pin: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        f"{pin}{PIN_PEPPER}".encode("utf-8"),
        salt,
        PIN_HASH_ITERATIONS,
    )
    return "pbkdf2_sha256${}${}${}".format(
        PIN_HASH_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_pin(pin: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_encoded, expected_encoded = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_encoded.encode("ascii"))
        expected = base64.urlsafe_b64decode(expected_encoded.encode("ascii"))
        actual = hashlib.pbkdf2_hmac(
            "sha256",
            f"{pin}{PIN_PEPPER}".encode("utf-8"),
            salt,
            int(iterations),
        )
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def public_user(user: dict) -> dict:
    return {key: user[key] for key in ("id", "name", "role", "is_admin")}


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    session = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest(),
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=SESSION_DAYS)).isoformat(),
    }
    await db.sessions.insert_one(session)
    return token


def unauthorized(message: str = "Accesso richiesto") -> HTTPException:
    return HTTPException(
        status_code=401,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized()
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise unauthorized()
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    session = await db.sessions.find_one({"token_hash": token_hash}, {"_id": 0})
    if not session:
        raise unauthorized("Sessione non valida. Accedi di nuovo")
    if session["expires_at"] <= now_iso():
        await db.sessions.delete_one({"token_hash": token_hash})
        raise unauthorized("Sessione scaduta. Accedi di nuovo")
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        await db.sessions.delete_one({"token_hash": token_hash})
        raise unauthorized("Utente non disponibile")
    return user


async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if not current_user.get("is_admin"):
        raise HTTPException(403, "Operazione riservata all'amministratore")
    return current_user


def ensure_self_or_admin(current_user: dict, user_id: str):
    if current_user["id"] != user_id and not current_user.get("is_admin"):
        raise HTTPException(403, "Non puoi accedere ai dati di un altro utente")


async def check_login_throttle(user_id: str):
    attempt = await db.login_attempts.find_one({"user_id": user_id}, {"_id": 0})
    if attempt and attempt.get("blocked_until", "") > now_iso():
        raise HTTPException(429, "Troppi tentativi. Riprova tra 15 minuti")


async def record_failed_login(user_id: str):
    now = datetime.now(timezone.utc)
    attempt = await db.login_attempts.find_one({"user_id": user_id}, {"_id": 0})
    window_start = now - timedelta(minutes=15)
    if not attempt or attempt.get("window_started", "") < window_start.isoformat():
        count = 1
        started = now.isoformat()
    else:
        count = int(attempt.get("count", 0)) + 1
        started = attempt["window_started"]
    updates = {"count": count, "window_started": started, "blocked_until": ""}
    if count >= 5:
        updates["blocked_until"] = (now + timedelta(minutes=15)).isoformat()
    await db.login_attempts.update_one(
        {"user_id": user_id},
        {"$set": updates},
        upsert=True,
    )


def validate_iso_date(value: str) -> str:
    """Validate and normalize an ISO calendar date (YYYY-MM-DD)."""
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("La data deve essere nel formato AAAA-MM-GG") from exc
    normalized = parsed.isoformat()
    if normalized != value:
        raise ValueError("La data deve essere nel formato AAAA-MM-GG")
    return normalized


def validate_month_string(value: str) -> str:
    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, "Il mese deve essere nel formato AAAA-MM") from exc
    normalized = parsed.strftime("%Y-%m")
    if normalized != value:
        raise HTTPException(400, "Il mese deve essere nel formato AAAA-MM")
    return normalized


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


async def ensure_unique_user_name(name: str, exclude_user_id: Optional[str] = None):
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    normalized = name.strip().casefold()
    if any(
        user.get("id") != exclude_user_id
        and user.get("name", "").strip().casefold() == normalized
        for user in users
    ):
        raise HTTPException(409, "Esiste già un utente con questo nome")


async def validate_shift_assignment(
    *,
    date_str: str,
    shift_type: str,
    user: dict,
    exclude_shift_id: Optional[str] = None,
):
    """Reject assignments that break the one-person-per-group roster rules."""
    exclude = {"$ne": exclude_shift_id} if exclude_shift_id else None

    same_day_query = {"date": date_str, "user_id": user["id"]}
    if exclude:
        same_day_query["id"] = exclude
    if await db.shifts.find_one(same_day_query, {"_id": 0}):
        raise HTTPException(409, f"{user['name']} ha già un turno il {date_str}")

    occupied_role_query = {
        "date": date_str,
        "shift_type": shift_type,
        "role": user["role"],
    }
    if exclude:
        occupied_role_query["id"] = exclude
    if await db.shifts.find_one(occupied_role_query, {"_id": 0}):
        raise HTTPException(
            409,
            f"Il gruppo {user['role']} è già assegnato al turno {shift_type} del {date_str}",
        )

    leave = await db.leaves.find_one(
        {
            "user_id": user["id"],
            "status": "approved",
            "start_date": {"$lte": date_str},
            "end_date": {"$gte": date_str},
        },
        {"_id": 0},
    )
    if leave:
        raise HTTPException(409, f"{user['name']} è in ferie il {date_str}")

    assigned_date = date.fromisoformat(date_str)
    previous_dates = [(assigned_date - timedelta(days=days)).isoformat() for days in (1, 2)]
    previous_night_query = {
        "user_id": user["id"],
        "shift_type": SHIFT_NOTTE,
        "date": {"$in": previous_dates},
    }
    if exclude:
        previous_night_query["id"] = exclude
    if await db.shifts.find_one(previous_night_query, {"_id": 0}):
        raise HTTPException(409, f"{user['name']} è in smontante/riposo il {date_str}")

    if shift_type == SHIFT_NOTTE:
        following_dates = [(assigned_date + timedelta(days=days)).isoformat() for days in (1, 2)]
        following_shift_query = {
            "user_id": user["id"],
            "date": {"$in": following_dates},
        }
        if exclude:
            following_shift_query["id"] = exclude
        if await db.shifts.find_one(following_shift_query, {"_id": 0}):
            raise HTTPException(
                409,
                f"{user['name']} ha già un turno nei due giorni successivi alla notte",
            )


# ============ ENDPOINTS ============
@api_router.get("/")
async def root():
    return {"message": "LAPS Turni API"}


# ===== SETUP =====
VALID_ROLES = {ROLE_AUTISTA, ROLE_CAPOTURNO, ROLE_SOCCORRITORE}


@api_router.get("/setup/status")
async def setup_status():
    count = await db.users.count_documents({})
    missing_pins = await db.users.count_documents({"pin_hash": {"$exists": False}})
    configured_pins = await db.users.count_documents({"pin_hash": {"$exists": True}})
    return {
        "initialized": count > 0,
        "user_count": count,
        "pin_setup_required": count > 0 and missing_pins > 0,
        "pin_setup_available": count > 0 and configured_pins == 0,
    }


@api_router.get("/auth/users", response_model=List[User])
async def public_users_for_login():
    users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).sort("name", 1).to_list(200)
    return [User(**user) for user in users]


@api_router.post("/auth/login")
async def login(payload: LoginPayload):
    ensure_pin_security_configured()
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user or not user.get("pin_hash"):
        raise unauthorized("Utente o PIN non valido")
    await check_login_throttle(user["id"])
    if not verify_pin(payload.pin, user["pin_hash"]):
        await record_failed_login(user["id"])
        raise unauthorized("Utente o PIN non valido")
    await db.login_attempts.delete_one({"user_id": user["id"]})
    token = await create_session(user["id"])
    return {"token": token, "user": public_user(user), "expires_in_days": SESSION_DAYS}


@api_router.post("/auth/logout")
async def logout(
    authorization: Optional[str] = Header(default=None),
    _: dict = Depends(get_current_user),
):
    token = (authorization or "").removeprefix("Bearer ").strip()
    await db.sessions.delete_one(
        {"token_hash": hashlib.sha256(token.encode("utf-8")).hexdigest()}
    )
    return {"ok": True}


@api_router.get("/auth/me", response_model=User)
async def auth_me(current_user: dict = Depends(get_current_user)):
    return User(**public_user(current_user))


@api_router.post("/auth/change-pin")
async def change_pin(
    payload: ChangePinPayload,
    current_user: dict = Depends(get_current_user),
):
    ensure_pin_security_configured()
    if not verify_pin(payload.current_pin, current_user.get("pin_hash", "")):
        raise HTTPException(400, "Il PIN attuale non è corretto")
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"pin_hash": hash_pin(payload.new_pin)}},
    )
    await db.sessions.delete_many({"user_id": current_user["id"]})
    token = await create_session(current_user["id"])
    return {"ok": True, "token": token}


@api_router.post("/auth/users/{user_id}/reset-pin")
async def reset_pin(
    user_id: str,
    payload: ResetPinPayload,
    current_user: dict = Depends(require_admin),
):
    ensure_pin_security_configured()
    if user_id == current_user["id"]:
        raise HTTPException(400, "Per il tuo profilo usa Cambia PIN")
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"pin_hash": hash_pin(payload.new_pin)}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Utente non trovato")
    await db.sessions.delete_many({"user_id": user_id})
    await db.login_attempts.delete_many({"user_id": user_id})
    return {"ok": True}


@api_router.post("/auth/bootstrap")
async def bootstrap_existing_pins(payload: BootstrapPinsPayload):
    """One-time migration for installations created before PIN authentication."""
    ensure_pin_security_configured()
    if not PIN_BOOTSTRAP_KEY:
        raise HTTPException(503, "Configura PIN_BOOTSTRAP_KEY sul server per eseguire la migrazione")
    if not hmac.compare_digest(payload.bootstrap_key, PIN_BOOTSTRAP_KEY):
        raise HTTPException(403, "Codice di migrazione non valido")
    users = await db.users.find({}, {"_id": 0}).to_list(200)
    if not users:
        raise HTTPException(400, "Completa prima la configurazione iniziale")
    if any(user.get("pin_hash") for user in users):
        raise HTTPException(409, "I PIN sono già stati configurati")
    submitted = {member.user_id: member.pin for member in payload.members}
    expected_ids = {user["id"] for user in users}
    if set(submitted) != expected_ids or len(payload.members) != len(users):
        raise HTTPException(400, "Imposta un PIN per ogni utente esistente")
    admin = next((user for user in users if user.get("is_admin")), None)
    if not admin:
        raise HTTPException(409, "Nessun amministratore configurato")
    for user in users:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"pin_hash": hash_pin(submitted[user["id"]])}},
        )
    token = await create_session(admin["id"])
    return {"ok": True, "token": token, "user": public_user(admin)}


@api_router.post("/setup")
async def setup_init(payload: SetupPayload):
    ensure_pin_security_configured()
    existing = await db.users.count_documents({})
    if existing > 0:
        raise HTTPException(400, "Setup già completato. Usa la gestione utenti.")
    if not payload.members:
        raise HTTPException(400, "Inserisci almeno un membro")
    if payload.admin_index < 0 or payload.admin_index >= len(payload.members):
        raise HTTPException(400, "Indice admin non valido")
    normalized_names = set()
    for m in payload.members:
        if m.role not in VALID_ROLES:
            raise HTTPException(400, f"Ruolo non valido: {m.role}")
        if not m.name.strip():
            raise HTTPException(400, "Il nome non può essere vuoto")
        normalized_name = m.name.strip().casefold()
        if normalized_name in normalized_names:
            raise HTTPException(409, f"Nome duplicato: {m.name.strip()}")
        normalized_names.add(normalized_name)
    docs = []
    for idx, m in enumerate(payload.members):
        docs.append({
            "id": str(uuid.uuid4()),
            "name": m.name.strip(),
            "role": m.role,
            "is_admin": idx == payload.admin_index,
            "pin_hash": hash_pin(m.pin),
        })
    await db.users.insert_many(docs)
    admin = docs[payload.admin_index]
    token = await create_session(admin["id"])
    return {
        "ok": True,
        "created": len(docs),
        "token": token,
        "user": public_user(admin),
    }


@api_router.post("/setup/reset")
async def setup_reset(_: dict = Depends(require_admin)):
    """Wipes ALL data (users, shifts, swaps, leaves, notifications). Irreversibile."""
    await db.users.delete_many({})
    await db.shifts.delete_many({})
    await db.swaps.delete_many({})
    await db.leaves.delete_many({})
    await db.notifications.delete_many({})
    await db.sessions.delete_many({})
    await db.login_attempts.delete_many({})
    return {"ok": True}


@api_router.get("/users", response_model=List[User])
async def list_users(_: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "pin_hash": 0}).to_list(100)
    return [User(**u) for u in users]


@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str, _: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return User(**u)


@api_router.post("/users", response_model=User)
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    ensure_pin_security_configured()
    if payload.role not in VALID_ROLES:
        raise HTTPException(400, "Ruolo non valido")
    if not payload.name.strip():
        raise HTTPException(400, "Il nome non può essere vuoto")
    await ensure_unique_user_name(payload.name)
    user = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "role": payload.role,
        "is_admin": False,  # Admin transfer via dedicated endpoint
        "pin_hash": hash_pin(payload.pin),
    }
    await db.users.insert_one(user.copy())
    return User(**user)


@api_router.patch("/users/{user_id}", response_model=User)
async def update_user(user_id: str, payload: UserUpdate, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    updates = {}
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(400, "Nome vuoto")
        await ensure_unique_user_name(payload.name, exclude_user_id=user_id)
        updates["name"] = payload.name.strip()
    if payload.role is not None:
        if payload.role not in VALID_ROLES:
            raise HTTPException(400, "Ruolo non valido")
        if payload.role != user["role"]:
            future_shifts = await db.shifts.count_documents(
                {"user_id": user_id, "date": {"$gte": today_italy().isoformat()}}
            )
            if future_shifts:
                raise HTTPException(
                    409,
                    f"Riassegna prima i {future_shifts} turni futuri dell'utente",
                )
        updates["role"] = payload.role
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        # Propagate name/role to denormalized fields
        if "name" in updates:
            await db.shifts.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
            await db.swaps.update_many({"from_user_id": user_id}, {"$set": {"from_user_name": updates["name"]}})
            await db.swaps.update_many({"to_user_id": user_id}, {"$set": {"to_user_name": updates["name"]}})
            await db.leaves.update_many({"user_id": user_id}, {"$set": {"user_name": updates["name"]}})
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    return User(**user)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if user.get("is_admin"):
        raise HTTPException(400, "Non puoi eliminare l'amministratore. Trasferisci prima il ruolo admin.")
    # Delete user + future shifts + their swaps/leaves/notifications
    today = today_italy().isoformat()
    await db.users.delete_one({"id": user_id})
    await db.shifts.delete_many({"user_id": user_id, "date": {"$gte": today}})
    await db.swaps.delete_many({"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}], "status": "pending"})
    await db.leaves.delete_many({"user_id": user_id, "status": "pending"})
    await db.notifications.delete_many({"user_id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    await db.login_attempts.delete_many({"user_id": user_id})
    return {"ok": True}


# ===== SHIFTS =====
@api_router.get("/shifts", response_model=List[Shift])
async def list_shifts(
    month: Optional[str] = None,
    user_id: Optional[str] = None,
    date_str: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {}
    if month:
        month = validate_month_string(month)
        query["date"] = {"$regex": f"^{month}"}
    if user_id:
        query["user_id"] = user_id
    if date_str:
        try:
            query["date"] = validate_iso_date(date_str)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    shifts = await db.shifts.find(query, {"_id": 0}).sort("date", 1).to_list(2000)
    return [Shift(**s) for s in shifts]


@api_router.post("/shifts", response_model=Shift)
async def create_shift(payload: ShiftCreate, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    await validate_shift_assignment(
        date_str=payload.date,
        shift_type=payload.shift_type,
        user=user,
    )
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


@api_router.put("/shifts/{shift_id}", response_model=Shift)
async def update_shift(
    shift_id: str,
    payload: ShiftCreate,
    _: dict = Depends(require_admin),
):
    current = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Turno non trovato")

    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")

    await validate_shift_assignment(
        date_str=payload.date,
        shift_type=payload.shift_type,
        user=user,
        exclude_shift_id=shift_id,
    )

    updates = {
        "date": payload.date,
        "shift_type": payload.shift_type,
        "user_id": user["id"],
        "user_name": user["name"],
        "role": user["role"],
    }
    await db.shifts.update_one({"id": shift_id}, {"$set": updates})

    if (
        current["user_id"] != user["id"]
        or current["date"] != payload.date
        or current["shift_type"] != payload.shift_type
    ):
        await create_notification(
            user["id"],
            "Turno aggiornato",
            f"Sei stato assegnato al turno {payload.shift_type} del {payload.date}",
            "shift",
        )

    updated = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return Shift(**updated)


@api_router.delete("/shifts/{shift_id}")
async def delete_shift(shift_id: str, _: dict = Depends(require_admin)):
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    if not shift:
        raise HTTPException(404, "Turno non trovato")
    result = await db.shifts.delete_one({"id": shift_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Turno non trovato")
    await db.swaps.delete_many({"shift_id": shift_id, "status": "pending"})
    return {"ok": True}


@api_router.post("/shifts/generate")
async def generate_shifts(req: GenerateRequest, _: dict = Depends(require_admin)):
    """Generate a validated month without silently breaking rest or leave rules."""
    year, month = req.year, req.month
    _, num_days = cal_mod.monthrange(year, month)
    month_prefix = f"{year:04d}-{month:02d}"

    if not req.overwrite:
        existing = await db.shifts.count_documents({"date": {"$regex": f"^{month_prefix}"}})
        if existing > 0:
            raise HTTPException(400, "Turni già esistenti. Usa overwrite=true per sovrascrivere.")

    users = await db.users.find({}, {"_id": 0}).to_list(100)
    autisti = [u for u in users if u["role"] == ROLE_AUTISTA]
    capoturni = [u for u in users if u["role"] == ROLE_CAPOTURNO]
    soccorritori = [u for u in users if u["role"] == ROLE_SOCCORRITORE]

    pools = {
        ROLE_AUTISTA: autisti,
        ROLE_CAPOTURNO: capoturni,
        ROLE_SOCCORRITORE: soccorritori,
    }
    for role, pool in pools.items():
        if len(pool) < 5:
            raise HTTPException(
                409,
                f"Servono almeno 5 membri nel gruppo {role} per rispettare notte, smontante e riposo",
            )

    # Target-month shifts are excluded from fairness calculations when overwriting.
    all_shifts = await db.shifts.find({}, {"_id": 0}).to_list(100000)
    historical_shifts = [s for s in all_shifts if not s.get("date", "").startswith(month_prefix)]
    total_load = defaultdict(int)
    holiday_load = defaultdict(int)
    shift_type_load = defaultdict(int)
    previous_year_holiday_workers = defaultdict(set)
    for s in historical_shifts:
        total_load[s["user_id"]] += 1
        shift_type_load[(s["user_id"], s.get("shift_type"))] += 1
        try:
            d = date.fromisoformat(s["date"])
            holiday_name = is_holiday(d)
            if holiday_name:
                holiday_load[s["user_id"]] += 1
                if d.year == year - 1:
                    previous_year_holiday_workers[holiday_name].add(s["user_id"])
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
    busy_today = defaultdict(set)
    rest_until = defaultdict(str)

    # Carry smontante/riposo into the new month from nights in the previous two days.
    first_day = date(year, month, 1)
    previous_month_dates = {
        (first_day - timedelta(days=1)).isoformat(),
        (first_day - timedelta(days=2)).isoformat(),
    }
    for shift in historical_shifts:
        if shift.get("shift_type") != SHIFT_NOTTE or shift.get("date") not in previous_month_dates:
            continue
        night_date = date.fromisoformat(shift["date"])
        rest_end = (night_date + timedelta(days=2)).isoformat()
        rest_until[shift["user_id"]] = max(rest_until[shift["user_id"]], rest_end)

    def is_resting(uid: str, d: date) -> bool:
        until = rest_until.get(uid)
        return bool(until) and d.isoformat() <= until

    def pick_user(pool, d: date, shift_type: str, holiday_name: Optional[str]):
        d_iso = d.isoformat()
        candidates = [
            u
            for u in pool
            if not is_on_leave(u["id"], d)
            and u["id"] not in busy_today[d_iso]
            and not is_resting(u["id"], d)
        ]
        if not candidates:
            role = pool[0]["role"] if pool else "sconosciuto"
            raise HTTPException(
                409,
                f"Impossibile coprire {shift_type} del {d_iso} per il gruppo {role}: verifica ferie e riposi",
            )

        if holiday_name:
            candidates.sort(
                key=lambda u: (
                    u["id"] in previous_year_holiday_workers[holiday_name],
                    holiday_load[u["id"]],
                    shift_type_load[(u["id"], shift_type)],
                    total_load[u["id"]],
                    u["name"],
                )
            )
        else:
            candidates.sort(
                key=lambda u: (
                    shift_type_load[(u["id"], shift_type)],
                    total_load[u["id"]],
                    u["name"],
                )
            )
        return candidates[0]

    for day in range(1, num_days + 1):
        d = date(year, month, day)
        d_str = d.isoformat()
        holiday_name = is_holiday(d)

        for shift_type in SHIFT_TYPES:
            assignments = []
            a = pick_user(autisti, d, shift_type, holiday_name)
            assignments.append((a, shift_type))
            busy_today[d_str].add(a["id"])

            c = pick_user(capoturni, d, shift_type, holiday_name)
            assignments.append((c, shift_type))
            busy_today[d_str].add(c["id"])

            s = pick_user(soccorritori, d, shift_type, holiday_name)
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
                shift_type_load[(user["id"], st)] += 1
                if holiday_name:
                    holiday_load[user["id"]] += 1

    # Destructive overwrite happens only after a complete replacement has been built.
    if req.overwrite:
        replaced_shifts = await db.shifts.find(
            {"date": {"$regex": f"^{month_prefix}"}},
            {"_id": 0, "id": 1},
        ).to_list(5000)
        replaced_ids = [shift["id"] for shift in replaced_shifts]
        await db.shifts.delete_many({"date": {"$regex": f"^{month_prefix}"}})
        if replaced_ids:
            await db.swaps.delete_many(
                {"shift_id": {"$in": replaced_ids}, "status": "pending"}
            )
    if created:
        await db.shifts.insert_many([s.copy() for s in created])

    return {"created": len(created), "month": month_prefix, "people_per_shift": 3}


# ===== SWAPS =====
@api_router.get("/swaps", response_model=List[SwapRequest])
async def list_swaps(
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if user_id:
        ensure_self_or_admin(current_user, user_id)
    elif not current_user.get("is_admin"):
        user_id = current_user["id"]
    query = {}
    if user_id:
        query = {"$or": [{"from_user_id": user_id}, {"to_user_id": user_id}]}
    swaps = await db.swaps.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [SwapRequest(**s) for s in swaps]


@api_router.post("/swaps", response_model=SwapRequest)
async def create_swap(
    payload: SwapCreate,
    current_user: dict = Depends(get_current_user),
):
    ensure_self_or_admin(current_user, payload.from_user_id)
    from_user = await db.users.find_one({"id": payload.from_user_id}, {"_id": 0})
    to_user = await db.users.find_one({"id": payload.to_user_id}, {"_id": 0})
    shift = await db.shifts.find_one({"id": payload.shift_id}, {"_id": 0})
    if not from_user or not to_user:
        raise HTTPException(404, "Utente non trovato")
    if not shift:
        raise HTTPException(404, "Turno non trovato")
    if payload.from_user_id == payload.to_user_id:
        raise HTTPException(400, "Seleziona un collega diverso")
    if shift["user_id"] != payload.from_user_id:
        raise HTTPException(403, "Puoi cedere soltanto un tuo turno")
    if from_user["role"] != to_user["role"]:
        raise HTTPException(400, "Lo scambio è possibile solo tra colleghi dello stesso ruolo")
    if shift["date"] < today_italy().isoformat():
        raise HTTPException(400, "Non puoi richiedere lo scambio di un turno passato")
    pending = await db.swaps.find_one(
        {"shift_id": payload.shift_id, "status": "pending"},
        {"_id": 0},
    )
    if pending:
        raise HTTPException(409, "Esiste già una richiesta pendente per questo turno")

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
async def respond_swap(
    swap_id: str,
    action: str,
    current_user: dict = Depends(get_current_user),
):
    if action not in ["accept", "reject"]:
        raise HTTPException(400, "Azione non valida")
    swap = await db.swaps.find_one({"id": swap_id}, {"_id": 0})
    if not swap:
        raise HTTPException(404, "Scambio non trovato")
    if swap["status"] != "pending":
        raise HTTPException(400, "Scambio già processato")
    if current_user["id"] != swap["to_user_id"] and not current_user.get("is_admin"):
        raise HTTPException(403, "Solo il destinatario può rispondere allo scambio")

    if action == "accept":
        shift = await db.shifts.find_one({"id": swap["shift_id"]}, {"_id": 0})
        if not shift:
            raise HTTPException(404, "Il turno non esiste più")
        if shift["user_id"] != swap["from_user_id"]:
            raise HTTPException(409, "Il turno è stato modificato e non può più essere ceduto")

        to_user = await db.users.find_one({"id": swap["to_user_id"]}, {"_id": 0})
        from_user = await db.users.find_one({"id": swap["from_user_id"]}, {"_id": 0})
        if not to_user or not from_user:
            raise HTTPException(404, "Utente non trovato")
        if to_user["role"] != from_user["role"] or to_user["role"] != shift["role"]:
            raise HTTPException(409, "I ruoli degli utenti sono cambiati: crea una nuova richiesta")

        await validate_shift_assignment(
            date_str=shift["date"],
            shift_type=shift["shift_type"],
            user=to_user,
            exclude_shift_id=shift["id"],
        )
        await db.shifts.update_one(
            {"id": swap["shift_id"]},
            {
                "$set": {
                    "user_id": to_user["id"],
                    "user_name": to_user["name"],
                    "role": to_user["role"],
                }
            },
        )

    new_status = "accepted" if action == "accept" else "rejected"
    await db.swaps.update_one({"id": swap_id}, {"$set": {"status": new_status}})

    await create_notification(
        swap["from_user_id"],
        f"Scambio {('accettato' if action == 'accept' else 'rifiutato')}",
        f"{swap['to_user_name']} ha {('accettato' if action == 'accept' else 'rifiutato')} il tuo scambio",
        "swap",
    )
    return {"ok": True, "status": new_status}


# ===== LEAVES =====
@api_router.get("/leaves", response_model=List[LeaveRequest])
async def list_leaves(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if user_id:
        ensure_self_or_admin(current_user, user_id)
    elif not current_user.get("is_admin"):
        colleagues = await db.users.find(
            {"role": current_user["role"], "id": {"$ne": current_user["id"]}},
            {"_id": 0, "id": 1},
        ).to_list(200)
        own_query = {"user_id": current_user["id"]}
        if status:
            own_query["status"] = status
        own = await db.leaves.find(own_query, {"_id": 0}).to_list(500)
        colleague_ids = [colleague["id"] for colleague in colleagues]
        team = []
        if status in (None, "approved"):
            team = await db.leaves.find(
                {"user_id": {"$in": colleague_ids}, "status": "approved"},
                {"_id": 0},
            ).to_list(500)
        for leave in team:
            leave["reason"] = None
        combined = own + team
        combined.sort(key=lambda leave: leave["created_at"], reverse=True)
        return [LeaveRequest(**leave) for leave in combined]
    query = {}
    if user_id:
        query["user_id"] = user_id
    if status:
        query["status"] = status
    leaves = await db.leaves.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [LeaveRequest(**lv) for lv in leaves]


@api_router.post("/leaves", response_model=LeaveRequest)
async def create_leave(
    payload: LeaveCreate,
    current_user: dict = Depends(get_current_user),
):
    ensure_self_or_admin(current_user, payload.user_id)
    user = await db.users.find_one({"id": payload.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if payload.start_date < today_italy().isoformat():
        raise HTTPException(400, "Non puoi richiedere ferie per un periodo già trascorso")
    overlapping = await db.leaves.find_one(
        {
            "user_id": payload.user_id,
            "status": {"$in": ["pending", "approved"]},
            "start_date": {"$lte": payload.end_date},
            "end_date": {"$gte": payload.start_date},
        },
        {"_id": 0},
    )
    if overlapping:
        raise HTTPException(409, "Esiste già una richiesta sovrapposta per questo periodo")
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
async def respond_leave(
    leave_id: str,
    action: str,
    _: dict = Depends(require_admin),
):
    if action not in ["approve", "reject"]:
        raise HTTPException(400, "Azione non valida")
    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Richiesta non trovata")
    if leave["status"] != "pending":
        raise HTTPException(409, "Richiesta già elaborata")
    if action == "approve":
        assigned_shifts = await db.shifts.count_documents(
            {
                "user_id": leave["user_id"],
                "date": {"$gte": leave["start_date"], "$lte": leave["end_date"]},
            }
        )
        if assigned_shifts:
            raise HTTPException(
                409,
                f"Riassegna prima i {assigned_shifts} turni presenti nel periodo richiesto",
            )
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
async def list_notifications(
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    ensure_self_or_admin(current_user, user_id)
    notifs = await db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [Notification(**n) for n in notifs]


@api_router.patch("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notif_id, "user_id": current_user["id"]},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Notifica non trovata")
    return {"ok": True}


@api_router.post("/notifications/mark-all-read")
async def mark_all_read(user_id: str, current_user: dict = Depends(get_current_user)):
    ensure_self_or_admin(current_user, user_id)
    await db.notifications.update_many({"user_id": user_id, "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ===== STATS =====
@api_router.get("/stats/{user_id}")
async def user_stats(
    user_id: str,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    ensure_self_or_admin(current_user, user_id)
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
async def export_csv(month: str, _: dict = Depends(get_current_user)):
    """month: YYYY-MM"""
    month = validate_month_string(month)
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
async def list_holidays(year: int, _: dict = Depends(get_current_user)):
    result = []
    for (m, d), name in FIXED_HOLIDAYS.items():
        result.append({"date": f"{year:04d}-{m:02d}-{d:02d}", "name": name})
    result.sort(key=lambda x: x["date"])
    return result


# ===== ADMIN MANAGEMENT =====
@api_router.patch("/users/{user_id}/admin")
async def set_admin(user_id: str, value: bool, _: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404, "Utente non trovato")
    if not value:
        raise HTTPException(400, "Trasferisci il ruolo admin a un altro utente")
    # Only one admin at a time: clear others
    await db.users.update_many({"is_admin": True}, {"$set": {"is_admin": False}})
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": value}})
    return {"ok": True}


# ===== ADMIN: delete month =====
@api_router.delete("/shifts/month/{month}")
async def delete_month(month: str, _: dict = Depends(require_admin)):
    month = validate_month_string(month)
    shifts = await db.shifts.find(
        {"date": {"$regex": f"^{month}"}},
        {"_id": 0, "id": 1},
    ).to_list(5000)
    shift_ids = [shift["id"] for shift in shifts]
    result = await db.shifts.delete_many({"date": {"$regex": f"^{month}"}})
    if shift_ids:
        await db.swaps.delete_many({"shift_id": {"$in": shift_ids}, "status": "pending"})
    return {"deleted": result.deleted_count}


app.include_router(api_router)

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)
