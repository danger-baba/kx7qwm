import math

import pytest

from app.metrics import error_summary, histogram, quantile


def test_quantile_matches_linear_interpolation():
    values = [1, 2, 3, 4, 5]
    assert quantile(values, 0) == 1
    assert quantile(values, 0.5) == 3
    assert quantile(values, 1) == 5
    assert quantile(values, 0.1) == pytest.approx(1.4)
    assert quantile([10, 0], 0.5) == 5  # input order doesn't matter


def test_quantile_empty_raises():
    with pytest.raises(ValueError):
        quantile([], 0.5)


def test_error_summary_known_values():
    s = error_summary(forecasts=[110, 90, 100, 140], actuals=[100, 100, 100, 100])
    # errors: 10, -10, 0, 40
    assert s["n"] == 4
    assert s["mae"] == 15
    assert s["bias"] == 10
    assert s["rmse"] == pytest.approx(math.sqrt((100 + 100 + 0 + 1600) / 4))
    assert s["nmae"] == pytest.approx(0.15)
    assert s["maxAbsError"] == 40


def test_error_summary_empty_and_mismatched():
    assert error_summary([], []) == {"n": 0}
    with pytest.raises(ValueError):
        error_summary([1], [])


def test_histogram_bins_cover_all_values():
    bins = histogram([-600, -1, 0, 499, 500, 1200], 500)
    assert [b["from"] for b in bins] == [-1000, -500, 0, 500, 1000]
    assert [b["count"] for b in bins] == [1, 1, 2, 1, 1]
    assert sum(b["count"] for b in bins) == 6
