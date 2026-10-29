"""Business rules: which forecast was available at decision time, and how it compares to actuals.

Conventions
-----------
* A *delivery day* is a UK local calendar day (Europe/London).
* The *decision cutoff* for delivery day D is a UK local time on D-1 (default: day-ahead gate closure).
* The *decision forecast* for a target hour is taken from the latest publish with publishTime <= cutoff
  that contains that target hour.
* WINDFOR is hourly and FUELHH half-hourly; we compare at hourly targets using the actual half-hour
  that starts on the hour.
* error = forecast - actual  (positive -> wind came in lower than forecast -> risk of being short).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from .config import UK_TZ
from .store import WindData

HOUR = timedelta(hours=1)


@dataclass(frozen=True)
class DecisionPoint:
    target: datetime  # UTC
    publish: datetime  # UTC, publish the forecast came from
    forecast: float
    actual: float | None

    @property
    def error(self) -> float | None:
        return None if self.actual is None else self.forecast - self.actual

    @property
    def horizon_hours(self) -> float:
        return (self.target - self.publish) / HOUR


def decision_cutoff(delivery_day: date, cutoff: time) -> datetime:
    """Cutoff on D-1 in UK local time, returned as UTC."""
    local = datetime.combine(delivery_day - timedelta(days=1), cutoff, tzinfo=UK_TZ)
    return local.astimezone(timezone.utc)


def delivery_hours(delivery_day: date) -> list[datetime]:
    """Hourly UTC target times covering the UK local delivery day (23/24/25 hours across DST)."""
    start = datetime.combine(delivery_day, time(0), tzinfo=UK_TZ).astimezone(timezone.utc)
    end = datetime.combine(delivery_day + timedelta(days=1), time(0), tzinfo=UK_TZ).astimezone(timezone.utc)
    hours, t = [], start
    while t < end:
        hours.append(t)
        t += HOUR
    return hours


def decision_forecast(data: WindData, delivery_day: date, cutoff: time) -> list[DecisionPoint]:
    """Forecast the trading desk would have seen at the cutoff for every hour of the delivery day."""
    available = data.publishes_up_to(decision_cutoff(delivery_day, cutoff))
    points = []
    for target in delivery_hours(delivery_day):
        for publish in reversed(available):
            gen = data.forecasts[publish].get(target)
            if gen is not None:
                points.append(DecisionPoint(target, publish, gen, data.actuals.get(target)))
                break
    return points


def forecast_evolution(data: WindData, delivery_day: date) -> list[tuple[datetime, dict[datetime, float]]]:
    """Every publish that covers the full delivery day, oldest first."""
    hours = delivery_hours(delivery_day)
    return [
        (p, {t: data.forecasts[p][t] for t in hours})
        for p in data.publish_times
        if all(t in data.forecasts[p] for t in hours)
    ]


def all_forecast_errors(data: WindData, targets: set[datetime]) -> list[tuple[float, float]]:
    """(horizon_hours, error) for every publish/target pair with an actual, horizon >= 0."""
    out = []
    for publish, series in data.forecasts.items():
        for target, gen in series.items():
            if target in targets and target >= publish and target in data.actuals:
                out.append(((target - publish) / HOUR, gen - data.actuals[target]))
    return out
