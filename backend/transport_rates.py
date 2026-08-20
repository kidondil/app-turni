"""Tariffario trasporti LAPS e relativo calcolo proporzionale.

I chilometri e gli importi ufficiali provengono dal file
``Tariffario Laps.xlsx``, aggiornato al 08/07/2026.
"""

from __future__ import annotations

import math
import unicodedata


TRANSPORT_RATE_KM = [
    ("ALBAGIARA", 47),
    ("ARBOREA", 25),
    ("ARDAULI", 58),
    ("BARATILI S. P.", 20),
    ("BAULADU", 24),
    ("BORORE", 54),
    ("BONARCADO", 36),
    ("BOSA", 78),
    ("BUSACHI", 54),
    ("CABRAS", 0),
    ("CAGLIARI", 100),
    ("CUGLIERI", 40),
    ("DONIGALA", 5),
    ("FORDONGIANUS", 36),
    ("GHILARZA", 46),
    ("MACOMER", 60),
    ("MAGOMADAS", 61),
    ("MARCEDDI", 38),
    ("MARRUBIU", 28),
    ("MASSAMA", 7),
    ("MILIS", 28),
    ("MOGORELLA", 40),
    ("NARBOLIA", 28),
    ("NUORO", 90),
    ("NURACHI", 17),
    ("NURAXINIEDDU", 6),
    ("OLBIA", 181),
    ("OLLASTRA", 24),
    ("ORISTANO", 8),
    ("PALMAS", 15),
    ("PAU", 57),
    ("PAULILATINO", 37),
    ("RIOLA", 20),
    ("RUINAS", 46),
    ("SAN NICOLO' ARC", 38),
    ("SAN VERO MILIS", 22),
    ("SANT'ANNA", 21),
    ("SANTA CATERINA", 35),
    ("SAN GAVINO", 60),
    ("SANTA GIUSTA", 12),
    ("SANTULUSSURGIU", 48),
    ("SAMUGHEO", 48),
    ("SASSARI", 122),
    ("SCANO MONTIF.", 55),
    ("S'ARCHITTU", 32),
    ("SEDILO", 56),
    ("SENEGHE", 33),
    ("SENNARIOLO", 53),
    ("SIAMAGGIORE", 17),
    ("SIAMANNA", 25),
    ("SIAPICCIA", 26),
    ("SILI", 10),
    ("SIMAXIS", 19),
    ("SOLARUSSA", 21),
    ("SORRADILE", 55),
    ("TERRALBA", 33),
    ("TIRIA", 16),
    ("TORRE GRANDE", 2),
    ("TRAMATZA", 22),
    ("TRESNURAGHES", 55),
    ("ULATIRSO", 53),
    ("USELLUS", 43),
    ("VILLANOVA TRUS.", 36),
    ("VILLAURBANA", 32),
    ("ZEDDIANI", 19),
    ("ZERFALIU", 24),
]


# Il tariffario ufficiale contiene tre importi deliberati che non coincidono
# con la formula proporzionale usata esclusivamente per le località fuori elenco.
OFFICIAL_RATE_OVERRIDES = {
    "CABRAS": {"andata": 60, "andata_ritorno": 70, "visita": 80},
    "CAGLIARI": {"andata": 180, "andata_ritorno": 250, "visita": 270},
    "SASSARI": {"andata": 220, "andata_ritorno": 260, "visita": 280},
}


def normalize_town_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.strip().casefold())
    return " ".join("".join(char for char in normalized if not unicodedata.combining(char)).split())


def round_to_ten(value: float) -> int:
    """Replicate Excel MROUND for positive monetary values."""
    return int(math.floor(value / 10 + 0.5) * 10)


def calculate_transport_prices(km: float) -> dict:
    if not math.isfinite(km) or km < 0 or km > 2000:
        raise ValueError("La distanza deve essere compresa tra 0 e 2.000 km")
    first_band = min(km, 100)
    extra_band = max(km - 100, 0)
    one_way = max(70, round_to_ten(70 + 1.10 * first_band + 0.90 * extra_band))
    round_trip = max(80, round_to_ten(80 + 1.60 * first_band + 1.00 * extra_band))
    return {
        "andata": one_way,
        "andata_ritorno": round_trip,
        "visita": round_trip + 20,
    }


def transport_rates() -> list[dict]:
    rates = []
    for town, km in TRANSPORT_RATE_KM:
        prices = OFFICIAL_RATE_OVERRIDES.get(town) or calculate_transport_prices(km)
        rates.append({"paese": town, "km": km, **prices})
    return rates


TRANSPORT_RATES = transport_rates()
TRANSPORT_RATES_BY_NAME = {
    normalize_town_name(rate["paese"]): rate for rate in TRANSPORT_RATES
}
