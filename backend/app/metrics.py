"""Forecast error statistics (pure Python, no numpy needed at this data size)."""

from __future__ import annotations

import math
from collections.abc import Sequence


def quantile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile (same as numpy's default 'linear' method)."""
    if not values:
        raise ValueError("quantile of empty sequence")
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def error_summary(forecasts: Sequence[float], actuals: Sequence[float]) -> dict:
    """Standard accuracy metrics. error = forecast - actual."""
    if len(forecasts) != len(actuals):
        raise ValueError("forecasts and actuals must have the same length")
    n = len(forecasts)
    if n == 0:
        return {"n": 0}
    errors = [f - a for f, a in zip(forecasts, actuals)]
    abs_errors = [abs(e) for e in errors]
    mean_actual = sum(actuals) / n
    mae = sum(abs_errors) / n
    return {
        "n": n,
        "mae": mae,
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
        "bias": sum(errors) / n,
        "nmae": mae / mean_actual if mean_actual else None,
        "meanActual": mean_actual,
        "p10": quantile(errors, 0.10),
        "p50": quantile(errors, 0.50),
        "p90": quantile(errors, 0.90),
        "p90AbsError": quantile(abs_errors, 0.90),
        "maxAbsError": max(abs_errors),
    }


def histogram(values: Sequence[float], bin_width: float) -> list[dict]:
    """Fixed-width bins aligned to multiples of bin_width."""
    if not values:
        return []
    lo = math.floor(min(values) / bin_width) * bin_width
    hi = math.floor(max(values) / bin_width) * bin_width
    counts = {lo + i * bin_width: 0 for i in range(int(round((hi - lo) / bin_width)) + 1)}
    for v in values:
        counts[math.floor(v / bin_width) * bin_width] += 1
    return [{"from": k, "to": k + bin_width, "count": c} for k, c in sorted(counts.items())]
