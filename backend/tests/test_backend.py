"""Backend tests for Italian rescue cooperative shift management - Iteration 2."""
import os
import pytest
import requests
from collections import defaultdict
from datetime import date, timedelta

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://coop-shift-manager.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def users(s):
    r = s.get(f"{API}/users", timeout=30)
    assert r.status_code == 200
    return r.json()


# ===== Users / Admin =====
class TestUsers:
    def test_list_users_count(self, users):
        assert len(users) == 16, f"Expected 16 users, got {len(users)}"

    def test_roles_distribution(self, users):
        roles = defaultdict(int)
        for u in users:
            roles[u["role"]] += 1
        assert roles["Autista"] == 5
        assert roles["Capoturno"] == 5
        assert roles["Soccorritore"] == 6

    def test_patch_admin_single_admin(self, s, users):
        stefano = next(u for u in users if u["name"] == "Stefano Conti")
        marco = next(u for u in users if u["name"] == "Marco Rossi")

        # Set Marco as admin
        r = s.patch(f"{API}/users/{marco['id']}/admin", params={"value": "true"}, timeout=15)
        assert r.status_code == 200

        r2 = s.get(f"{API}/users", timeout=15)
        admins = [u for u in r2.json() if u["is_admin"]]
        assert len(admins) == 1
        assert admins[0]["id"] == marco["id"]

        # Restore Stefano
        r = s.patch(f"{API}/users/{stefano['id']}/admin", params={"value": "true"}, timeout=15)
        assert r.status_code == 200
        r2 = s.get(f"{API}/users", timeout=15)
        admins = [u for u in r2.json() if u["is_admin"]]
        assert len(admins) == 1
        assert admins[0]["id"] == stefano["id"]


# ===== Shifts Generation =====
class TestShiftGeneration:
    def test_generate_july_2026(self, s):
        r = s.post(f"{API}/shifts/generate", json={"year": 2026, "month": 7, "overwrite": True}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        # 31 days * 9 shifts/day = 279
        assert data["created"] == 31 * 9, f"Expected 279 shifts, got {data['created']}"
        assert data["month"] == "2026-07"

    def test_shifts_per_day_count(self, s):
        r = s.get(f"{API}/shifts", params={"date_str": "2026-07-15"}, timeout=30)
        assert r.status_code == 200
        shifts = r.json()
        assert len(shifts) == 9, f"Expected 9 shifts on 2026-07-15, got {len(shifts)}"

    def test_shift_composition_per_day(self, s):
        r = s.get(f"{API}/shifts", params={"date_str": "2026-07-10"}, timeout=30)
        shifts = r.json()
        by_type = defaultdict(list)
        for sh in shifts:
            by_type[sh["shift_type"]].append(sh)
        for st in ["Mattina", "Pomeriggio", "Notte"]:
            assert len(by_type[st]) == 3, f"{st}: expected 3 people, got {len(by_type[st])}"
            roles = sorted(x["role"] for x in by_type[st])
            assert roles == ["Autista", "Capoturno", "Soccorritore"], f"{st}: roles={roles}"

    def test_smontante_riposo_after_notte(self, s):
        """For every user with a Notte shift on day D, no shift on D+1 or D+2."""
        r = s.get(f"{API}/shifts", params={"month": "2026-07"}, timeout=60)
        assert r.status_code == 200
        shifts = r.json()
        # Build map user_id -> set of dates worked
        worked = defaultdict(set)
        notte_days = defaultdict(set)
        for sh in shifts:
            worked[sh["user_id"]].add(sh["date"])
            if sh["shift_type"] == "Notte":
                notte_days[sh["user_id"]].add(sh["date"])

        violations = []
        for uid, dates_set in notte_days.items():
            for d_str in dates_set:
                d = date.fromisoformat(d_str)
                for delta in (1, 2):
                    next_d = (d + timedelta(days=delta)).isoformat()
                    # only check if within month
                    if next_d.startswith("2026-07") and next_d in worked[uid]:
                        violations.append((uid, d_str, next_d))
        assert not violations, f"Smontante+Riposo violations: {violations[:5]} (total {len(violations)})"


# ===== Leaves =====
class TestLeaves:
    def test_create_leave_notifies_same_role_only(self, s, users):
        soccorritori = [u for u in users if u["role"] == "Soccorritore"]
        requester = soccorritori[0]
        others = soccorritori[1:]

        # capture baseline notification counts for requester and one other
        def notif_count(uid):
            rr = s.get(f"{API}/notifications", params={"user_id": uid}, timeout=15)
            return len([n for n in rr.json() if n["type"] == "leave"])

        before_req = notif_count(requester["id"])
        before_others = {o["id"]: notif_count(o["id"]) for o in others}

        # Also check an Autista should NOT be notified
        autista = next(u for u in users if u["role"] == "Autista")
        before_autista = notif_count(autista["id"])

        payload = {
            "user_id": requester["id"],
            "start_date": "2026-09-10",
            "end_date": "2026-09-12",
            "reason": "TEST_leave_notif",
        }
        r = s.post(f"{API}/leaves", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        leave = r.json()
        assert leave["status"] == "pending"

        # Requester should NOT receive new leave notification
        after_req = notif_count(requester["id"])
        assert after_req == before_req, "Requester should not be notified on own request"

        # Each other Soccorritore should have +1
        for o in others:
            after = notif_count(o["id"])
            assert after == before_others[o["id"]] + 1, f"{o['name']} expected +1 notif"

        # Autista should NOT receive any
        after_autista = notif_count(autista["id"])
        assert after_autista == before_autista, "Other-role users should not be notified"

        # Cleanup: store leave id for next test
        TestLeaves.leave_id = leave["id"]
        TestLeaves.requester_id = requester["id"]
        TestLeaves.others_ids = [o["id"] for o in others]

    def test_approve_leave_notifies_only_requester(self, s):
        leave_id = TestLeaves.leave_id
        requester_id = TestLeaves.requester_id
        others_ids = TestLeaves.others_ids

        def notif_count(uid):
            rr = s.get(f"{API}/notifications", params={"user_id": uid}, timeout=15)
            return len([n for n in rr.json() if n["type"] == "leave"])

        before_req = notif_count(requester_id)
        before_others = {oid: notif_count(oid) for oid in others_ids}

        r = s.patch(f"{API}/leaves/{leave_id}", params={"action": "approve"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"

        after_req = notif_count(requester_id)
        assert after_req == before_req + 1, "Requester should get exactly one approval notification"

        for oid in others_ids:
            assert notif_count(oid) == before_others[oid], "Others should not be notified on approval"


# ===== Swaps =====
class TestSwaps:
    def test_swap_create_and_accept(self, s, users):
        # Find two Autisti and a shift of one of them in 2026-07
        autisti = [u for u in users if u["role"] == "Autista"]
        r = s.get(f"{API}/shifts", params={"month": "2026-07", "user_id": autisti[0]["id"]}, timeout=30)
        shifts = r.json()
        assert len(shifts) > 0
        target_shift = shifts[0]

        payload = {
            "from_user_id": autisti[0]["id"],
            "to_user_id": autisti[1]["id"],
            "shift_id": target_shift["id"],
            "message": "TEST_swap",
        }
        r = s.post(f"{API}/swaps", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        swap = r.json()
        assert swap["status"] == "pending"

        r = s.patch(f"{API}/swaps/{swap['id']}", params={"action": "accept"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"

        # Verify shift transferred
        r = s.get(f"{API}/shifts", params={"date_str": target_shift["date"]}, timeout=15)
        match = next((x for x in r.json() if x["id"] == target_shift["id"]), None)
        assert match is not None
        assert match["user_id"] == autisti[1]["id"]


# ===== Stats / Export =====
class TestStatsExport:
    def test_stats(self, s, users):
        u = users[0]
        r = s.get(f"{API}/stats/{u['id']}", params={"year": 2026}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "total_shifts" in data
        assert "by_type" in data
        assert set(data["by_type"].keys()) == {"Mattina", "Pomeriggio", "Notte"}
        assert "total_hours" in data
        assert "holidays_worked" in data

    def test_export_csv(self, s):
        r = s.get(f"{API}/export/2026-07", timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        assert "Data;Turno" in body
        # at least 280 lines (header + 279)
        lines = body.strip().split("\n")
        assert len(lines) >= 280, f"Expected >=280 lines, got {len(lines)}"
