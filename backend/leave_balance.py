"""Calcolo del saldo ferie a partire da un saldo iniziale verificabile."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable


MONTHLY_LEAVE_ACCRUAL = 2.5


def _inclusive_days(start: date, end: date) -> int:
    return max(0, (end - start).days + 1)


def calculate_leave_balance(
    user: dict,
    leaves: Iterable[dict],
    *,
    as_of: date,
) -> dict:
    initial = user.get("leave_initial_balance")
    reference_value = user.get("leave_balance_date")
    if initial is None or not reference_value:
        return {
            "configured": False,
            "monthly_accrual": MONTHLY_LEAVE_ACCRUAL,
        }

    reference = date.fromisoformat(reference_value)
    month_count = max(0, (as_of.year - reference.year) * 12 + as_of.month - reference.month)
    accrued = month_count * MONTHLY_LEAVE_ACCRUAL
    used = 0
    scheduled = 0
    tomorrow = as_of + timedelta(days=1)

    for leave in leaves:
        if leave.get("status") != "approved":
            continue
        if leave.get("absence_type", "Ferie") != "Ferie":
            continue
        start = max(reference, date.fromisoformat(leave["start_date"]))
        end = date.fromisoformat(leave["end_date"])
        if end < start:
            continue
        used += _inclusive_days(start, min(end, as_of)) if start <= as_of else 0
        future_start = max(start, tomorrow)
        if future_start <= end:
            scheduled += _inclusive_days(future_start, end)

    remaining = float(initial) + accrued - used
    return {
        "configured": True,
        "initial_balance": round(float(initial), 2),
        "balance_date": reference.isoformat(),
        "monthly_accrual": MONTHLY_LEAVE_ACCRUAL,
        "accrued": round(accrued, 2),
        "used": used,
        "scheduled": scheduled,
        "remaining": round(remaining, 2),
        "available_after_scheduled": round(remaining - scheduled, 2),
        "as_of": as_of.isoformat(),
    }
