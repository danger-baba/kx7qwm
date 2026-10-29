"""Pull January 2026 wind actuals and forecasts from Elexon into data/snapshot.json.

Usage (from backend/):  python -m scripts.ingest
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import BAND_DAYS, FIRST_DELIVERY_DAY, LAST_DELIVERY_DAY, SNAPSHOT_FILE, TRAILING_BIAS_DAYS  # noqa: E402
from app.elexon import fetch_wind_actuals, fetch_wind_forecasts  # noqa: E402

# History before the first delivery day for the trailing bias and uncertainty band (settled
# days before D-1), plus ~3 days for forecasts because they are published up to ~66 h ahead.
ACTUALS_LOOKBACK = timedelta(days=max(TRAILING_BIAS_DAYS, BAND_DAYS) + 2)
FORECAST_LOOKBACK = ACTUALS_LOOKBACK + timedelta(days=3)


def main() -> None:
    # Settlement dates are UK local days; fetch an extra day at the end so every UTC hour is covered.
    actual_rows = fetch_wind_actuals(FIRST_DELIVERY_DAY - ACTUALS_LOOKBACK, LAST_DELIVERY_DAY + timedelta(days=1))

    fc_start = datetime.combine(FIRST_DELIVERY_DAY, datetime.min.time(), timezone.utc) - FORECAST_LOOKBACK
    fc_end = datetime.combine(LAST_DELIVERY_DAY, datetime.min.time(), timezone.utc)
    forecast_rows = fetch_wind_forecasts(fc_start, fc_end)

    actuals = sorted({r["startTime"]: r["generation"] for r in actual_rows}.items())
    forecasts = sorted({(r["publishTime"], r["startTime"]): r["generation"] for r in forecast_rows}.items())

    snapshot = {
        "source": "Elexon BMRS Insights API (FUELHH fuelType=WIND, WINDFOR)",
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "actuals": [[t, g] for t, g in actuals],
        "forecasts": [[p, t, g] for (p, t), g in forecasts],
    }
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_FILE.write_text(json.dumps(snapshot, separators=(",", ":")))

    publishes = {p for (p, _), _ in forecasts}
    print(f"actuals: {len(actuals)} rows  ({actuals[0][0]} .. {actuals[-1][0]})")
    print(f"forecasts: {len(forecasts)} rows from {len(publishes)} publishes")
    print(f"wrote {SNAPSHOT_FILE} ({SNAPSHOT_FILE.stat().st_size / 1024:.0f} KiB)")


if __name__ == "__main__":
    main()
