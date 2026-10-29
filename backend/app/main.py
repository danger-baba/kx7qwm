"""FastAPI application. All routes live under /api so the same app works behind nginx and on Vercel."""

from __future__ import annotations

from datetime import date, time

from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import analysis
from .config import CORS_ORIGINS, DEFAULT_CUTOFF, FIRST_DELIVERY_DAY, LAST_DELIVERY_DAY

app = FastAPI(title="Wind Forecast Decision API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)

router = APIRouter(prefix="/api")

CUTOFF_QUERY = Query(DEFAULT_CUTOFF.strftime("%H:%M"), pattern=r"^\d{2}:\d{2}$", description="Decision cutoff on D-1, UK local time")


def parse_cutoff(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(422, f"Invalid cutoff time: {value}") from exc


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/meta")
def meta() -> dict:
    return {**analysis.meta(), "defaultCutoff": DEFAULT_CUTOFF.strftime("%H:%M")}


@router.get("/day-ahead")
def day_ahead(day: date = Query(..., description="Delivery day (UK local), YYYY-MM-DD"), cutoff: str = CUTOFF_QUERY) -> dict:
    if not FIRST_DELIVERY_DAY <= day <= LAST_DELIVERY_DAY:
        raise HTTPException(404, f"Delivery day must be between {FIRST_DELIVERY_DAY} and {LAST_DELIVERY_DAY}")
    return analysis.day_ahead(day, parse_cutoff(cutoff))


@router.get("/accuracy")
def accuracy(cutoff: str = CUTOFF_QUERY) -> dict:
    return analysis.accuracy(parse_cutoff(cutoff))


app.include_router(router)
