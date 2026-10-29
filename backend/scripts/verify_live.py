"""Independent end-to-end check: re-derive the decision forecasts straight from the live Elexon API
(without importing any app code) and compare them with what the running app returns.

Usage (app running, e.g. via docker compose):
    python scripts/verify_live.py                       # defaults to http://localhost:8080/api
    python scripts/verify_live.py http://localhost:8000/api
"""

from __future__ import annotations

import json
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

ELEXON = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CUTOFF = timedelta(hours=9, minutes=20)  # default cutoff; in January UK local time == UTC


def get(url: str):
    with urllib.request.urlopen(url, timeout=60) as resp:
        return json.load(resp)


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def main(app: str) -> int:
    actual_rows = get(f"{ELEXON}/FUELHH/stream?settlementDateFrom=2026-01-02&settlementDateTo=2026-02-01&fuelType=WIND")
    actuals = {parse(r["startTime"]): r["generation"] for r in actual_rows if r["fuelType"] == "WIND"}
    forecasts: dict[datetime, dict[datetime, float]] = {}
    for r in get(f"{ELEXON}/WINDFOR/stream?publishDateTimeFrom=2025-12-31T00:00:00Z&publishDateTimeTo=2026-02-01T00:00:00Z"):
        forecasts.setdefault(parse(r["publishTime"]), {})[parse(r["startTime"])] = r["generation"]

    mismatches, abs_error, hours = 0, 0.0, 0
    for k in range(31):
        day = datetime(2026, 1, 2, tzinfo=timezone.utc) + timedelta(days=k)
        cutoff = day - timedelta(days=1) + CUTOFF
        publish = max(t for t in forecasts if t <= cutoff)
        body = get(f"{app}/day-ahead?day={day.date()}")
        if body["publishesUsed"] != [publish.strftime("%Y-%m-%dT%H:%M:%SZ")]:
            mismatches += 1
            print(f"{day.date()}: app used {body['publishesUsed']}, expected {publish}")
        for h, row in enumerate(body["series"]):
            t = day + timedelta(hours=h)
            if row["forecast"] != forecasts[publish][t] or row["actual"] != actuals[t]:
                mismatches += 1
                print(f"{t}: app {row['forecast']}/{row['actual']}, Elexon {forecasts[publish][t]}/{actuals[t]}")
            abs_error += abs(forecasts[publish][t] - actuals[t])
            hours += 1

    mae, app_mae = abs_error / hours, get(f"{app}/accuracy")["overall"]["mae"]
    print(f"Checked 31 delivery days / {hours} hours against live Elexon data: {mismatches} mismatches")
    print(f"MAE recomputed independently: {mae:.1f} MW, app: {app_mae:.1f} MW")
    ok = mismatches == 0 and abs(mae - app_mae) < 0.01
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/api"))
