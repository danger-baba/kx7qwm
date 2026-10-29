"""API tests against the committed January 2026 snapshot."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_lists_delivery_days_for_january_decisions():
    meta = client.get("/api/meta").json()
    assert meta["deliveryDays"][0] == "2026-01-02"
    assert meta["deliveryDays"][-1] == "2026-02-01"
    assert len(meta["deliveryDays"]) == 31
    assert meta["defaultCutoff"] == "09:20"


def test_day_ahead_uses_last_publish_before_gate_closure():
    body = client.get("/api/day-ahead", params={"day": "2026-01-15"}).json()
    assert body["cutoffUtc"] == "2026-01-14T09:20:00Z"
    assert body["publishesUsed"] == ["2026-01-14T07:30:00Z"]
    assert len(body["series"]) == 24
    assert all(p["low"] <= p["forecast"] <= p["high"] or p["low"] == 0 for p in body["series"])
    assert all(e["beforeCutoff"] == (e["publishTime"] <= body["cutoffUtc"]) for e in body["evolution"])


def test_later_cutoff_picks_later_publish():
    body = client.get("/api/day-ahead", params={"day": "2026-01-15", "cutoff": "10:00"}).json()
    assert body["publishesUsed"] == ["2026-01-14T09:30:00Z"]


def test_day_ahead_validation():
    assert client.get("/api/day-ahead", params={"day": "2026-03-01"}).status_code == 404
    assert client.get("/api/day-ahead", params={"day": "2026-01-15", "cutoff": "9am"}).status_code == 422
    assert client.get("/api/day-ahead", params={"day": "2026-01-15", "cutoff": "25:00"}).status_code == 422


def test_accuracy_covers_whole_month():
    body = client.get("/api/accuracy").json()
    assert body["overall"]["n"] == 31 * 24
    assert len(body["daily"]) == 31
    assert len(body["byHour"]) == 24
    assert sum(b["count"] for b in body["histogram"]) == body["overall"]["n"]
    assert 16 <= body["decisionHorizon"]["min"] <= body["decisionHorizon"]["max"] <= 40
    assert 0.7 < body["band"]["coverage"] < 0.9  # P10-P90 band should hold ~80% of hours
    # bias adjustment is meant to reduce systematic error
    assert abs(body["adjusted"]["bias"]) < abs(body["overall"]["bias"])
