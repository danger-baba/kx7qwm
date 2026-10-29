"""Central configuration. Values can be overridden with environment variables."""

import os
from datetime import date, time
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# Snapshot produced by scripts/ingest.py
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
SNAPSHOT_FILE = DATA_DIR / "snapshot.json"

# Purchase decisions made in January 2026 -> delivery days 2 Jan .. 1 Feb 2026 (UK local days)
FIRST_DELIVERY_DAY = date(2026, 1, 2)
LAST_DELIVERY_DAY = date(2026, 2, 1)

# GB day-ahead auction gate closure on D-1 (UK local time). Configurable per request.
DEFAULT_CUTOFF = time(9, 20)

# Both use only delivery days fully settled by the cutoff on D-1 (D-2 back to D-1-N), so they
# rely solely on information available at decision time.
TRAILING_BIAS_DAYS = 7  # bias adjustment: mean error of the last N settled days
BAND_DAYS = 14  # uncertainty band: P10/P90 of errors over the last N settled days

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
