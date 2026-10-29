"""Thin client for the Elexon BMRS Insights API (FUELHH and WINDFOR stream endpoints)."""

from __future__ import annotations

import time as _time
from datetime import date, datetime, timedelta

import httpx

from .config import ELEXON_BASE_URL

CHUNK_DAYS = 7
MAX_RETRIES = 3


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.get(f"{ELEXON_BASE_URL}{path}", params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError):
            if attempt == MAX_RETRIES:
                raise
            _time.sleep(2**attempt)
    return []


def fetch_wind_actuals(start: date, end: date, client: httpx.Client | None = None) -> list[dict]:
    """Half-hourly outturn wind generation (FUELHH, fuelType=WIND) for settlement dates [start, end]."""
    rows: list[dict] = []
    with client or httpx.Client(timeout=60) as c:
        chunk_start = start
        while chunk_start <= end:
            chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS - 1), end)
            rows += _get(
                c,
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": chunk_start.isoformat(),
                    "settlementDateTo": chunk_end.isoformat(),
                    "fuelType": "WIND",
                },
            )
            chunk_start = chunk_end + timedelta(days=1)
    return [r for r in rows if r.get("fuelType") == "WIND"]


def fetch_wind_forecasts(start: datetime, end: datetime, client: httpx.Client | None = None) -> list[dict]:
    """All WINDFOR forecast publishes with publishTime in [start, end)."""
    rows: list[dict] = []
    with client or httpx.Client(timeout=60) as c:
        chunk_start = start
        while chunk_start < end:
            chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS), end)
            rows += _get(
                c,
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": chunk_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "publishDateTimeTo": chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
            )
            chunk_start = chunk_end
    return rows
