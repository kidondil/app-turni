"""Isolated API tests. No request is ever sent to the deployed application."""

import os
import sys
import asyncio
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "app_turni_test")
os.environ.setdefault("PIN_PEPPER", "test-only-pepper")
os.environ.setdefault("PIN_BOOTSTRAP_KEY", "test-bootstrap-key")

import server  # noqa: E402


@pytest.fixture()
def api():
    server.db = AsyncMongoMockClient()["app_turni_test"]
    with TestClient(server.app) as test_client:
        yield test_client


@pytest.fixture()
def users(api):
    members = []
    members.extend({"name": f"Autista {idx}", "role": "Autista", "pin": f"11{idx:02d}"} for idx in range(1, 6))
    members.extend({"name": f"Capoturno {idx}", "role": "Capoturno", "pin": f"22{idx:02d}"} for idx in range(1, 6))
    members.extend({"name": f"Soccorritore {idx}", "role": "Soccorritore", "pin": f"33{idx:02d}"} for idx in range(1, 7))
    response = api.post("/api/setup", json={"members": members, "admin_index": 0})
    assert response.status_code == 200
    api.headers.update({"Authorization": f"Bearer {response.json()['token']}"})
    return api.get("/api/users").json()


def by_role(users, role):
    return [user for user in users if user["role"] == role]


def create_shift(api, user, day, shift_type="Mattina"):
    return api.post(
        "/api/shifts",
        json={"date": day, "shift_type": shift_type, "user_id": user["id"]},
    )


def login_headers(api, user, pin):
    response = api.post(
        "/api/auth/login",
        json={"user_id": user["id"], "pin": pin},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_authentication_and_permissions(api, users):
    autisti = by_role(users, "Autista")
    admin_headers = dict(api.headers)

    public_users = api.get("/api/auth/users", headers={"Authorization": ""})
    assert public_users.status_code == 200
    assert all("pin_hash" not in user for user in public_users.json())
    assert api.get("/api/shifts", headers={"Authorization": ""}).status_code == 401
    assert api.post(
        "/api/auth/login",
        json={"user_id": autisti[1]["id"], "pin": "9999"},
        headers={"Authorization": ""},
    ).status_code == 401

    member_headers = login_headers(api, autisti[1], "1102")
    assert api.get("/api/swaps", headers=member_headers).status_code == 200
    assert api.get(f"/api/stats/{autisti[1]['id']}", headers=member_headers).status_code == 200
    assert api.get(f"/api/stats/{autisti[2]['id']}", headers=member_headers).status_code == 403
    assert api.post(
        "/api/shifts",
        json={"date": "2039-01-01", "shift_type": "Mattina", "user_id": autisti[1]["id"]},
        headers=member_headers,
    ).status_code == 403

    colleague_leave = api.post(
        "/api/leaves",
        json={
            "user_id": autisti[2]["id"],
            "start_date": "2039-03-01",
            "end_date": "2039-03-02",
            "reason": "Motivo riservato",
        },
        headers=admin_headers,
    )
    assert colleague_leave.status_code == 200
    assert api.patch(
        f"/api/leaves/{colleague_leave.json()['id']}",
        params={"action": "approve"},
        headers=admin_headers,
    ).status_code == 200
    visible_team_leaves = api.get("/api/leaves", headers=member_headers).json()
    assert [leave["user_id"] for leave in visible_team_leaves] == [autisti[2]["id"]]
    assert visible_team_leaves[0]["reason"] is None
    assert api.post(
        "/api/leaves",
        json={"user_id": autisti[2]["id"], "start_date": "2039-02-01", "end_date": "2039-02-02"},
        headers=member_headers,
    ).status_code == 403

    reset = api.post(
        f"/api/auth/users/{autisti[1]['id']}/reset-pin",
        json={"new_pin": "7788"},
        headers=admin_headers,
    )
    assert reset.status_code == 200
    assert api.get("/api/auth/me", headers=member_headers).status_code == 401
    assert login_headers(api, autisti[1], "7788")


def test_change_pin_rotates_session(api, users):
    user = by_role(users, "Soccorritore")[0]
    old_headers = login_headers(api, user, "3301")
    wrong = api.post(
        "/api/auth/change-pin",
        json={"current_pin": "0000", "new_pin": "5544"},
        headers=old_headers,
    )
    assert wrong.status_code == 400

    changed = api.post(
        "/api/auth/change-pin",
        json={"current_pin": "3301", "new_pin": "5544"},
        headers=old_headers,
    )
    assert changed.status_code == 200
    assert api.get("/api/auth/me", headers=old_headers).status_code == 401
    new_headers = {"Authorization": f"Bearer {changed.json()['token']}"}
    assert api.get("/api/auth/me", headers=new_headers).status_code == 200


def test_one_time_pin_migration_preserves_existing_data(api):
    old_users = [
        {"id": "old-admin", "name": "Admin Esistente", "role": "Autista", "is_admin": True},
        {"id": "old-member", "name": "Membro Esistente", "role": "Soccorritore", "is_admin": False},
    ]
    old_shift = {
        "id": "old-shift",
        "date": "2038-01-01",
        "shift_type": "Mattina",
        "user_id": "old-admin",
        "user_name": "Admin Esistente",
        "role": "Autista",
        "created_at": "2037-12-01T00:00:00+00:00",
    }
    asyncio.run(server.db.users.insert_many(old_users))
    asyncio.run(server.db.shifts.insert_one(old_shift))

    status = api.get("/api/setup/status").json()
    assert status["pin_setup_required"] is True
    assert status["pin_setup_available"] is True
    migrated = api.post(
        "/api/auth/bootstrap",
        json={
            "bootstrap_key": "test-bootstrap-key",
            "members": [
                {"user_id": "old-admin", "pin": "1234"},
                {"user_id": "old-member", "pin": "5678"},
            ]
        },
    )
    assert migrated.status_code == 200, migrated.text
    headers = {"Authorization": f"Bearer {migrated.json()['token']}"}
    shifts = api.get("/api/shifts", headers=headers).json()
    assert [shift["id"] for shift in shifts] == ["old-shift"]
    assert api.post(
        "/api/auth/bootstrap",
        json={"bootstrap_key": "test-bootstrap-key", "members": [{"user_id": "old-admin", "pin": "9999"}]},
    ).status_code == 409


def test_setup_and_single_admin(api, users):
    status = api.get("/api/setup/status")
    assert status.status_code == 200
    assert status.json() == {
        "initialized": True,
        "user_count": 16,
        "pin_setup_required": False,
        "pin_setup_available": False,
    }
    assert len([user for user in users if user["is_admin"]]) == 1


def test_shift_create_edit_and_conflict_validation(api, users):
    autisti = by_role(users, "Autista")
    capoturno = by_role(users, "Capoturno")[0]
    day = "2030-01-10"

    created = create_shift(api, autisti[0], day)
    assert created.status_code == 200
    shift_id = created.json()["id"]

    assert create_shift(api, autisti[0], day, "Pomeriggio").status_code == 409
    assert create_shift(api, autisti[1], day).status_code == 409
    assert create_shift(api, capoturno, day).status_code == 200

    updated = api.put(
        f"/api/shifts/{shift_id}",
        json={"date": day, "shift_type": "Pomeriggio", "user_id": autisti[1]["id"]},
    )
    assert updated.status_code == 200
    assert updated.json()["shift_type"] == "Pomeriggio"
    assert updated.json()["user_id"] == autisti[1]["id"]

    duplicate_name = api.post(
        "/api/users",
        json={"name": "autista 1", "role": "Autista", "pin": "9876"},
    )
    assert duplicate_name.status_code == 409
    role_change = api.patch(
        f"/api/users/{autisti[1]['id']}",
        json={"role": "Soccorritore"},
    )
    assert role_change.status_code == 409

    assert create_shift(api, autisti[2], "data-non-valida").status_code == 422
    assert api.get("/api/shifts", params={"month": "2030-["}).status_code == 400


def test_complete_team_can_be_created_updated_and_deleted(api, users):
    day = "2030-01-20"
    autisti = by_role(users, "Autista")
    capoturno = by_role(users, "Capoturno")[0]
    soccorritore = by_role(users, "Soccorritore")[0]

    created = api.put(
        "/api/shift-teams",
        json={
            "date": day,
            "shift_type": "Mattina",
            "user_ids": [autisti[0]["id"], capoturno["id"], soccorritore["id"]],
        },
    )
    assert created.status_code == 200, created.text
    assert len(created.json()) == 3
    assert {shift["role"] for shift in created.json()} == {
        "Autista",
        "Capoturno",
        "Soccorritore",
    }
    original_ids = {shift["role"]: shift["id"] for shift in created.json()}

    pending_swap = api.post(
        "/api/swaps",
        json={
            "from_user_id": autisti[0]["id"],
            "to_user_id": autisti[2]["id"],
            "shift_id": original_ids["Autista"],
        },
    )
    assert pending_swap.status_code == 200, pending_swap.text

    updated = api.put(
        "/api/shift-teams",
        json={
            "date": day,
            "shift_type": "Mattina",
            "user_ids": [autisti[1]["id"], capoturno["id"], soccorritore["id"]],
        },
    )
    assert updated.status_code == 200, updated.text
    updated_by_role = {shift["role"]: shift for shift in updated.json()}
    assert updated_by_role["Autista"]["user_id"] == autisti[1]["id"]
    assert updated_by_role["Autista"]["id"] == original_ids["Autista"]
    assert updated_by_role["Capoturno"]["id"] == original_ids["Capoturno"]
    assert api.get("/api/swaps", params={"status": "pending"}).json() == []

    incomplete = api.put(
        "/api/shift-teams",
        json={
            "date": day,
            "shift_type": "Pomeriggio",
            "user_ids": [autisti[2]["id"], capoturno["id"]],
        },
    )
    assert incomplete.status_code == 422

    deleted = api.delete(
        "/api/shift-teams",
        params={"date_str": day, "shift_type": "Mattina"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] == 3
    assert api.get("/api/shifts", params={"date_str": day}).json() == []


def test_manual_assignment_respects_night_recovery(api, users):
    autista = by_role(users, "Autista")[0]
    assert create_shift(api, autista, "2030-02-10", "Notte").status_code == 200
    assert create_shift(api, autista, "2030-02-11", "Mattina").status_code == 409
    assert create_shift(api, autista, "2030-02-12", "Pomeriggio").status_code == 409
    assert create_shift(api, autista, "2030-02-13", "Mattina").status_code == 200


def test_month_generation_has_three_people_and_rest(api, users):
    response = api.post(
        "/api/shifts/generate",
        json={"year": 2031, "month": 3, "overwrite": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["created"] == 31 * 9
    assert response.json()["people_per_shift"] == 3
    for user in users:
        notifications = api.get(
            "/api/notifications",
            params={"user_id": user["id"]},
        ).json()
        assert any(
            notification["title"] == "Nuovi turni pubblicati"
            and "marzo 2031" in notification["body"]
            for notification in notifications
        )

    shifts = api.get("/api/shifts", params={"month": "2031-03"}).json()
    by_day_and_type = defaultdict(list)
    worked = defaultdict(set)
    nights = defaultdict(set)
    for shift in shifts:
        by_day_and_type[(shift["date"], shift["shift_type"])].append(shift)
        worked[shift["user_id"]].add(shift["date"])
        if shift["shift_type"] == "Notte":
            nights[shift["user_id"]].add(shift["date"])

    for day in range(1, 32):
        day_string = f"2031-03-{day:02d}"
        for shift_type in ("Mattina", "Pomeriggio", "Notte"):
            team = by_day_and_type[(day_string, shift_type)]
            assert len(team) == 3
            assert {member["role"] for member in team} == {
                "Autista",
                "Capoturno",
                "Soccorritore",
            }

    for user_id, night_days in nights.items():
        for night_day in night_days:
            night_date = date.fromisoformat(night_day)
            for offset in (1, 2):
                recovery_day = (night_date + timedelta(days=offset)).isoformat()
                if recovery_day.startswith("2031-03"):
                    assert recovery_day not in worked[user_id]

    invalid_month = api.post(
        "/api/shifts/generate",
        json={"year": 2031, "month": 13, "overwrite": False},
    )
    assert invalid_month.status_code == 422

    march_last_night = {
        shift["user_id"]
        for shift in shifts
        if shift["date"] == "2031-03-31" and shift["shift_type"] == "Notte"
    }
    april = api.post(
        "/api/shifts/generate",
        json={"year": 2031, "month": 4, "overwrite": False},
    )
    assert april.status_code == 200
    april_start = api.get("/api/shifts", params={"month": "2031-04"}).json()
    for shift in april_start:
        if shift["date"] in {"2031-04-01", "2031-04-02"}:
            assert shift["user_id"] not in march_last_night


def test_leave_notification_reaches_same_group_and_admin_without_reason(api, users):
    admin = next(user for user in users if user["is_admin"])
    requester = by_role(users, "Soccorritore")[0]
    same_group = by_role(users, "Soccorritore")[1:]
    outside_group = by_role(users, "Capoturno")[0]

    requester_headers = login_headers(api, requester, "3301")
    created = api.post(
        "/api/leaves",
        json={
            "user_id": requester["id"],
            "start_date": "2039-08-10",
            "end_date": "2039-08-14",
            "reason": "Motivazione strettamente privata",
        },
        headers=requester_headers,
    )
    assert created.status_code == 200, created.text

    for recipient in [admin, *same_group]:
        notifications = api.get(
            "/api/notifications",
            params={"user_id": recipient["id"]},
        ).json()
        leave_notifications = [item for item in notifications if item["type"] == "leave"]
        assert leave_notifications
        assert all("Motivazione" not in item["body"] for item in leave_notifications)
        assert all("10/08/2039" in item["body"] for item in leave_notifications)

    outside_notifications = api.get(
        "/api/notifications",
        params={"user_id": outside_group["id"]},
    ).json()
    assert not any(item["type"] == "leave" for item in outside_notifications)


def test_failed_overwrite_keeps_existing_month(api, users):
    autisti = by_role(users, "Autista")
    for index, user in enumerate(autisti[:3]):
        leave = api.post(
            "/api/leaves",
            json={
                "user_id": user["id"],
                "start_date": "2036-01-01",
                "end_date": "2036-01-31",
                "reason": f"Test {index}",
            },
        )
        assert leave.status_code == 200
        approved = api.patch(f"/api/leaves/{leave.json()['id']}", params={"action": "approve"})
        assert approved.status_code == 200

    marker = create_shift(api, autisti[3], "2036-01-01", "Mattina")
    assert marker.status_code == 200

    generated = api.post(
        "/api/shifts/generate",
        json={"year": 2036, "month": 1, "overwrite": True},
    )
    assert generated.status_code == 409
    remaining = api.get("/api/shifts", params={"date_str": "2036-01-01"}).json()
    assert [shift["id"] for shift in remaining] == [marker.json()["id"]]


def test_leave_validation_overlap_and_shift_conflict(api, users):
    user = by_role(users, "Soccorritore")[0]
    invalid = api.post(
        "/api/leaves",
        json={"user_id": user["id"], "start_date": "2034-04-12", "end_date": "2034-04-10"},
    )
    assert invalid.status_code == 422

    leave = api.post(
        "/api/leaves",
        json={"user_id": user["id"], "start_date": "2034-04-10", "end_date": "2034-04-12"},
    )
    assert leave.status_code == 200
    overlapping = api.post(
        "/api/leaves",
        json={"user_id": user["id"], "start_date": "2034-04-12", "end_date": "2034-04-14"},
    )
    assert overlapping.status_code == 409
    assert api.patch(f"/api/leaves/{leave.json()['id']}", params={"action": "approve"}).status_code == 200
    assert api.patch(f"/api/leaves/{leave.json()['id']}", params={"action": "approve"}).status_code == 409

    shifted_user = by_role(users, "Capoturno")[0]
    assert create_shift(api, shifted_user, "2034-05-10").status_code == 200
    conflict_leave = api.post(
        "/api/leaves",
        json={"user_id": shifted_user["id"], "start_date": "2034-05-10", "end_date": "2034-05-10"},
    )
    assert conflict_leave.status_code == 200
    approval = api.patch(
        f"/api/leaves/{conflict_leave.json()['id']}",
        params={"action": "approve"},
    )
    assert approval.status_code == 409


def test_swap_requires_ownership_and_valid_recipient(api, users):
    autisti = by_role(users, "Autista")
    capoturno = by_role(users, "Capoturno")[0]
    shift = create_shift(api, autisti[0], "2035-06-10", "Mattina").json()

    not_owner = api.post(
        "/api/swaps",
        json={"from_user_id": autisti[1]["id"], "to_user_id": autisti[0]["id"], "shift_id": shift["id"]},
    )
    assert not_owner.status_code == 403

    wrong_role = api.post(
        "/api/swaps",
        json={"from_user_id": autisti[0]["id"], "to_user_id": capoturno["id"], "shift_id": shift["id"]},
    )
    assert wrong_role.status_code == 400

    request = api.post(
        "/api/swaps",
        json={"from_user_id": autisti[0]["id"], "to_user_id": autisti[1]["id"], "shift_id": shift["id"]},
    )
    assert request.status_code == 200
    duplicate = api.post(
        "/api/swaps",
        json={"from_user_id": autisti[0]["id"], "to_user_id": autisti[2]["id"], "shift_id": shift["id"]},
    )
    assert duplicate.status_code == 409

    accepted = api.patch(f"/api/swaps/{request.json()['id']}", params={"action": "accept"})
    assert accepted.status_code == 200
    updated_shift = api.get("/api/shifts", params={"date_str": "2035-06-10"}).json()[0]
    assert updated_shift["user_id"] == autisti[1]["id"]


def test_stats_and_csv_export(api, users):
    user = by_role(users, "Autista")[0]
    assert create_shift(api, user, "2037-07-01", "Mattina").status_code == 200
    assert create_shift(api, user, "2037-07-04", "Notte").status_code == 200

    stats = api.get(f"/api/stats/{user['id']}", params={"year": 2037})
    assert stats.status_code == 200
    assert stats.json()["total_shifts"] == 2
    assert stats.json()["total_hours"] == 18

    exported = api.get("/api/export/2037-07")
    assert exported.status_code == 200
    assert "text/csv" in exported.headers["content-type"]
    assert "Data;Turno;Orario;Ruolo;Nome" in exported.text


def test_admin_cannot_be_removed_without_transfer(api, users):
    admin = next(user for user in users if user["is_admin"])
    response = api.patch(f"/api/users/{admin['id']}/admin", params={"value": "false"})
    assert response.status_code == 400
