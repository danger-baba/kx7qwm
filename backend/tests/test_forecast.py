from datetime import date, datetime, time, timezone

import pytest

from app.forecast import decision_cutoff, decision_forecast, delivery_hours, forecast_evolution
from app.store import WindData


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def make_data(publishes: dict[str, dict[str, float]], actuals: dict[str, float] | None = None) -> WindData:
    return WindData.from_rows(
        actuals=list((actuals or {}).items()),
        forecasts=[(p, t, g) for p, series in publishes.items() for t, g in series.items()],
    )


def full_day(day: str, value: float) -> dict[str, float]:
    return {f"{day}T{h:02d}:00:00Z": value for h in range(24)}


def test_cutoff_is_previous_day_uk_local_in_winter():
    assert decision_cutoff(date(2026, 1, 15), time(9, 20)) == utc(2026, 1, 14, 9, 20)


def test_cutoff_respects_british_summer_time():
    # 1 Jul 09:20 BST == 08:20 UTC
    assert decision_cutoff(date(2026, 7, 2), time(9, 20)) == utc(2026, 7, 1, 8, 20)


@pytest.mark.parametrize("day,expected", [(date(2026, 1, 15), 24), (date(2026, 3, 29), 23), (date(2026, 10, 25), 25)])
def test_delivery_day_hours_handle_dst(day, expected):
    assert len(delivery_hours(day)) == expected


def test_uses_latest_publish_before_cutoff_and_ignores_later_ones():
    data = make_data(
        {
            "2026-01-14T04:30:00Z": full_day("2026-01-15", 100),
            "2026-01-14T07:30:00Z": full_day("2026-01-15", 200),  # latest before 09:20 -> used
            "2026-01-14T09:30:00Z": full_day("2026-01-15", 300),  # after cutoff -> not visible
        }
    )
    points = decision_forecast(data, date(2026, 1, 15), time(9, 20))
    assert len(points) == 24
    assert {p.forecast for p in points} == {200}
    assert {p.publish for p in points} == {utc(2026, 1, 14, 7, 30)}


def test_publish_exactly_at_cutoff_is_visible():
    data = make_data({"2026-01-14T09:20:00Z": full_day("2026-01-15", 1)})
    assert decision_forecast(data, date(2026, 1, 15), time(9, 20))[0].forecast == 1


def test_falls_back_to_older_publish_when_latest_does_not_cover_target():
    latest = full_day("2026-01-15", 200)
    del latest["2026-01-15T23:00:00Z"]
    data = make_data({"2026-01-13T22:30:00Z": full_day("2026-01-15", 100), "2026-01-14T07:30:00Z": latest})
    points = decision_forecast(data, date(2026, 1, 15), time(9, 20))
    assert points[-1].forecast == 100 and points[0].forecast == 200


def test_no_forecast_available_returns_empty():
    data = make_data({"2026-01-14T10:30:00Z": full_day("2026-01-15", 1)})
    assert decision_forecast(data, date(2026, 1, 15), time(9, 20)) == []


def test_error_sign_and_horizon():
    data = make_data(
        {"2026-01-14T07:30:00Z": full_day("2026-01-15", 1000)},
        actuals={"2026-01-15T00:00:00Z": 800, "2026-01-15T00:30:00Z": 50},
    )
    first = decision_forecast(data, date(2026, 1, 15), time(9, 20))[0]
    assert first.actual == 800  # half-hour starting on the hour, not the :30 one
    assert first.error == 200  # positive = over-forecast
    assert first.horizon_hours == 16.5
    assert decision_forecast(data, date(2026, 1, 15), time(9, 20))[1].error is None


def test_evolution_only_includes_publishes_covering_whole_day():
    partial = full_day("2026-01-15", 1)
    del partial["2026-01-15T12:00:00Z"]
    data = make_data({"2026-01-13T07:30:00Z": partial, "2026-01-14T07:30:00Z": full_day("2026-01-15", 2)})
    evo = forecast_evolution(data, date(2026, 1, 15))
    assert [p for p, _ in evo] == [utc(2026, 1, 14, 7, 30)]
