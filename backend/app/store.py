"""In-memory data store loaded once from the JSON snapshot."""

from __future__ import annotations

import json
from bisect import bisect_right
from dataclasses import dataclass, field
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from .config import SNAPSHOT_FILE


def parse_utc(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


@dataclass
class WindData:
    actuals: dict[datetime, float]
    # publishTime -> {target startTime -> forecast MW}
    forecasts: dict[datetime, dict[datetime, float]]
    source: str = ""
    fetched_at: str = ""
    publish_times: list[datetime] = field(init=False)

    def __post_init__(self) -> None:
        self.publish_times = sorted(self.forecasts)

    def publishes_up_to(self, cutoff: datetime) -> list[datetime]:
        """Publish times <= cutoff, oldest first."""
        return self.publish_times[: bisect_right(self.publish_times, cutoff)]

    @classmethod
    def from_rows(
        cls,
        actuals: list[tuple[str, float]],
        forecasts: list[tuple[str, str, float]],
        source: str = "",
        fetched_at: str = "",
    ) -> "WindData":
        fc: dict[datetime, dict[datetime, float]] = {}
        for publish, target, gen in forecasts:
            fc.setdefault(parse_utc(publish), {})[parse_utc(target)] = float(gen)
        return cls(
            actuals={parse_utc(t): float(g) for t, g in actuals},
            forecasts=fc,
            source=source,
            fetched_at=fetched_at,
        )


@lru_cache(maxsize=1)
def load_data(path: Path = SNAPSHOT_FILE) -> WindData:
    raw = json.loads(Path(path).read_text())
    return WindData.from_rows(raw["actuals"], raw["forecasts"], raw.get("source", ""), raw.get("fetchedAt", ""))
