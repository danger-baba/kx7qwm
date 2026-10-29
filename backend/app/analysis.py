"""Builds the API payloads from the store + business rules."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from functools import lru_cache

from .config import BAND_DAYS, FIRST_DELIVERY_DAY, LAST_DELIVERY_DAY, TRAILING_BIAS_DAYS, UK_TZ
from .forecast import (
    DecisionPoint,
    all_forecast_errors,
    decision_cutoff,
    decision_forecast,
    delivery_hours,
    forecast_evolution,
)
from .metrics import error_summary, histogram, quantile
from .store import load_data

HORIZON_BUCKET_HOURS = 3
HISTOGRAM_BIN_MW = 500
BAND_LOW_Q, BAND_HIGH_Q = 0.10, 0.90


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def delivery_days() -> list[date]:
    n = (LAST_DELIVERY_DAY - FIRST_DELIVERY_DAY).days + 1
    return [FIRST_DELIVERY_DAY + timedelta(days=i) for i in range(n)]


@lru_cache(maxsize=4096)
def _day_points(day: date, cutoff: time) -> tuple[DecisionPoint, ...]:
    return tuple(decision_forecast(load_data(), day, cutoff))


def _month_points(cutoff: time) -> dict[date, tuple[DecisionPoint, ...]]:
    return {d: _day_points(d, cutoff) for d in delivery_days()}


def _scored(points) -> list[DecisionPoint]:
    return [p for p in points if p.actual is not None]


def settled_errors(day: date, cutoff: time, n_days: int) -> list[float]:
    """Decision-forecast errors for the n_days delivery days fully settled by the cutoff on D-1,
    i.e. D-2 back to D-1-n_days. Only information available at decision time."""
    return [p.error for k in range(2, n_days + 2) for p in _scored(_day_points(day - timedelta(days=k), cutoff))]


@lru_cache(maxsize=4096)
def trailing_bias(day: date, cutoff: time) -> float:
    errors = settled_errors(day, cutoff, TRAILING_BIAS_DAYS)
    return sum(errors) / len(errors) if errors else 0.0


@lru_cache(maxsize=4096)
def uncertainty_band(day: date, cutoff: time) -> tuple[float, float]:
    """P10/P90 of (actual - forecast) over the last BAND_DAYS settled days, as offsets to the forecast."""
    residuals = [-e for e in settled_errors(day, cutoff, BAND_DAYS)]
    return quantile(residuals, BAND_LOW_Q), quantile(residuals, BAND_HIGH_Q)


def meta() -> dict:
    data = load_data()
    return {
        "deliveryDays": [d.isoformat() for d in delivery_days()],
        "decisionMonth": "2026-01",
        "timezone": "Europe/London",
        "source": data.source,
        "fetchedAt": data.fetched_at,
        "publishCount": len(data.publish_times),
    }


def day_ahead(delivery_day: date, cutoff: time) -> dict:
    data = load_data()
    points = _day_points(delivery_day, cutoff)
    lo, hi = uncertainty_band(delivery_day, cutoff)
    bias = trailing_bias(delivery_day, cutoff)
    cutoff_utc = decision_cutoff(delivery_day, cutoff)
    scored = _scored(points)

    series = [
        {
            "time": iso(p.target),
            "localHour": p.target.astimezone(UK_TZ).strftime("%H:%M"),
            "forecast": p.forecast,
            "adjusted": max(0.0, p.forecast - bias),
            "low": max(0.0, p.forecast + lo),
            "high": p.forecast + hi,
            "actual": p.actual,
            "error": p.error,
            "publishTime": iso(p.publish),
            "horizonHours": p.horizon_hours,
        }
        for p in points
    ]
    publishes_used = sorted({p.publish for p in points})

    evolution = [
        {
            "publishTime": iso(publish),
            "beforeCutoff": publish <= cutoff_utc,
            "values": [values[t] for t in delivery_hours(delivery_day)],
        }
        for publish, values in forecast_evolution(data, delivery_day)
    ]

    forecast_mwh = sum(p.forecast for p in points)  # hourly MW * 1 h
    return {
        "deliveryDay": delivery_day.isoformat(),
        "cutoffLocal": cutoff.strftime("%H:%M"),
        "cutoffUtc": iso(cutoff_utc),
        "publishesUsed": [iso(p) for p in publishes_used],
        "band": {"lowQuantile": BAND_LOW_Q, "highQuantile": BAND_HIGH_Q, "lowOffset": lo, "highOffset": hi, "days": BAND_DAYS},
        "summary": {
            "forecastMWh": forecast_mwh,
            "actualMWh": sum(p.actual for p in scored) if len(scored) == len(points) else None,
            "peakForecast": max((p.forecast for p in points), default=None),
            "minForecast": min((p.forecast for p in points), default=None),
            "trailingBias": bias,
            "errors": error_summary([p.forecast for p in scored], [p.actual for p in scored]),
            "adjustedErrors": error_summary([max(0.0, p.forecast - bias) for p in scored], [p.actual for p in scored]),
        },
        "series": series,
        "hours": [p.target.astimezone(UK_TZ).strftime("%H:%M") for p in points],
        "evolution": evolution,
    }


def _by_key(points: list[DecisionPoint], key) -> list[tuple]:
    groups: dict = {}
    for p in points:
        groups.setdefault(key(p), []).append(p)
    return sorted(groups.items())


@lru_cache(maxsize=64)
def accuracy(cutoff: time) -> dict:
    data = load_data()
    month = _month_points(cutoff)
    scored = [p for pts in month.values() for p in _scored(pts)]
    adjusted = [max(0.0, p.forecast - trailing_bias(d, cutoff)) for d, pts in month.items() for p in _scored(pts)]

    by_hour = [
        {"hour": h, **error_summary([p.forecast for p in g], [p.actual for p in g])}
        for h, g in _by_key(scored, lambda p: p.target.astimezone(UK_TZ).hour)
    ]
    daily = []
    for d, pts in month.items():
        s = _scored(pts)
        bias = trailing_bias(d, cutoff)
        daily.append(
            {
                "day": d.isoformat(),
                "forecastMWh": sum(p.forecast for p in s),
                "actualMWh": sum(p.actual for p in s),
                "trailingBias": bias,
                "adjustedMae": error_summary([max(0.0, p.forecast - bias) for p in s], [p.actual for p in s])["mae"],
                **error_summary([p.forecast for p in s], [p.actual for p in s]),
            }
        )

    # Horizon analysis uses every publish (not just the decision one) for all delivery-window hours.
    targets = {t for d in delivery_days() for t in delivery_hours(d)}
    pairs = all_forecast_errors(data, targets)
    by_horizon = []
    for bucket in sorted({int(h // HORIZON_BUCKET_HOURS) for h, _ in pairs}):
        errs = [e for h, e in pairs if int(h // HORIZON_BUCKET_HOURS) == bucket]
        abs_errs = [abs(e) for e in errs]
        by_horizon.append(
            {
                "fromHours": bucket * HORIZON_BUCKET_HOURS,
                "toHours": (bucket + 1) * HORIZON_BUCKET_HOURS,
                "n": len(errs),
                "mae": sum(abs_errs) / len(errs),
                "rmse": (sum(e * e for e in errs) / len(errs)) ** 0.5,
                "bias": sum(errs) / len(errs),
                "p90AbsError": quantile(abs_errs, 0.9),
            }
        )

    in_band = 0
    for d, pts in month.items():
        lo, hi = uncertainty_band(d, cutoff)
        in_band += sum(p.forecast + lo <= p.actual <= p.forecast + hi for p in _scored(pts))

    horizons = [p.horizon_hours for p in scored]
    return {
        "cutoffLocal": cutoff.strftime("%H:%M"),
        "overall": error_summary([p.forecast for p in scored], [p.actual for p in scored]),
        "adjusted": error_summary(adjusted, [p.actual for p in scored]),
        "trailingBiasDays": TRAILING_BIAS_DAYS,
        "band": {"days": BAND_DAYS, "target": BAND_HIGH_Q - BAND_LOW_Q, "coverage": in_band / len(scored)},
        "decisionHorizon": {"min": min(horizons), "max": max(horizons)},
        "histogram": histogram([p.error for p in scored], HISTOGRAM_BIN_MW),
        "byHour": by_hour,
        "byHorizon": by_horizon,
        "daily": daily,
        "scatter": [{"forecast": p.forecast, "actual": p.actual} for p in scored],
    }
