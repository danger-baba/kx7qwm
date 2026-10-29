"""The bias adjustment and uncertainty band must only use information available at the cutoff."""

from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.analysis import settled_errors, trailing_bias, uncertainty_band
from app.config import BAND_DAYS, TRAILING_BIAS_DAYS
from app.forecast import decision_cutoff, decision_forecast
from app.metrics import quantile
from app.store import load_data

DAY = date(2026, 1, 20)
CUTOFF = time(9, 20)


def manual_errors(n_days: int) -> list[float]:
    data = load_data()
    days = [DAY - timedelta(days=k) for k in range(2, n_days + 2)]
    return [p.error for d in days for p in decision_forecast(data, d, CUTOFF) if p.error is not None]


def test_settled_days_end_before_the_cutoff():
    # Latest day used is D-2, which ends at midnight before D-1 - i.e. before the cutoff on D-1.
    latest_day_end = datetime.combine(DAY - timedelta(days=1), time(0), tzinfo=timezone.utc)
    assert latest_day_end <= decision_cutoff(DAY, CUTOFF)
    assert len(settled_errors(DAY, CUTOFF, BAND_DAYS)) == BAND_DAYS * 24


def test_trailing_bias_matches_manual_calculation():
    errors = manual_errors(TRAILING_BIAS_DAYS)
    assert trailing_bias(DAY, CUTOFF) == pytest.approx(sum(errors) / len(errors))


def test_band_matches_manual_calculation():
    residuals = [-e for e in manual_errors(BAND_DAYS)]
    lo, hi = uncertainty_band(DAY, CUTOFF)
    assert lo == pytest.approx(quantile(residuals, 0.1))
    assert hi == pytest.approx(quantile(residuals, 0.9))
    assert lo < hi
