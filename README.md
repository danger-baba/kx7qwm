# Wind Forecast Desk

A web portal for a UK energy supplier's **day-ahead trading desk**. For every power purchase decision made in **January 2026**, it shows:

1. **The wind forecast the desk actually had when it had to buy.** That is the latest national wind forecast published before the day-ahead cutoff, with a calibrated range of likely outcomes.
2. **How far that forecast can be trusted.** Forecast error is measured against actual wind generation and broken down by forecast horizon, hour of day and day. A bias-corrected forecast is also provided, built only from information available at decision time.

| | |
|---|---|
| **Live app** | **https://kx7qwm.vercel.app** |
| **Video walkthrough** | `<YOUTUBE_URL>` |
| **Stack** | React + TypeScript (Vite, Recharts) · Python (FastAPI) · Docker · Vercel |
| **Data** | Elexon BMRS: `FUELHH` (actual wind) and `WINDFOR` (wind forecasts), national level |

---

## Contents

1. [The problem](#1-the-problem)
2. [Key findings](#2-key-findings)
3. [Using the app](#3-using-the-app)
4. [Methodology and assumptions](#4-methodology-and-assumptions)
5. [Architecture and design decisions](#5-architecture-and-design-decisions)
6. [API](#6-api)
7. [Repository layout](#7-repository-layout)
8. [Getting started](#8-getting-started)
9. [Testing and verification](#9-testing-and-verification)
10. [Configuration](#10-configuration)
11. [Development practices](#11-development-practices)
12. [Requirements coverage](#12-requirements-coverage)
13. [Limitations and next steps](#13-limitations-and-next-steps)
14. [AI usage](#14-ai-usage)
15. [Data attribution](#15-data-attribution)

---

## 1. The problem

A UK electricity supplier must buy tomorrow's power **today**, on the day-ahead auction (gate closure 09:20 UK time on D-1). Part of its customers' demand is met by wind, so the volume it buys is roughly:

```
volume to buy  =  expected demand  −  expected wind generation
```

Wind depends on the weather, so expected wind comes from a **forecast**. If the forecast is too high, the supplier buys too little and covers the shortfall at expensive imbalance prices. If it's too low, the supplier over-buys. The desk therefore needs to know **what the forecast said at decision time** and **how wrong it tends to be**.

---

## 2. Key findings

09:20 D-1 cutoff, 31 delivery days (2 Jan – 1 Feb 2026), 744 delivery hours:

| Metric | Decision forecast | Bias-adjusted forecast |
|---|---|---|
| Mean absolute error (MAE) | **2,022 MW** (18% of mean wind) | **1,606 MW** (−21%) |
| Root mean square error (RMSE) | 2,497 MW | 2,056 MW |
| Mean bias (forecast − actual) | **+1,746 MW** | +251 MW |
| 90% of hours within | ±4.15 GW | ±3.51 GW |

- **The forecast is systematically too high.** It over-predicted wind in **85% of hours**. The bias shows up at every horizon, even 0–3 h ahead, so it is structural (likely curtailment or a difference in metering scope between WINDFOR and FUELHH) rather than weather-forecast skill. Trading on the raw forecast leaves the book short.
- **A simple correction cuts error by 21%.** Subtracting the mean error of the previous 7 settled days, which is known at decision time, reduces MAE from 2,022 to 1,606 MW.
- **The likely range is well calibrated.** The P10–P90 band, built only from the previous 14 settled days, contained the actual wind in **81.6% of hours** against an 80% target.
- **Error grows with horizon:** ~1.7 GW at 0–3 h ahead, ~2.0 GW in the 16.5–39.5 h window that a day-ahead decision uses.
- **A later decision helps:** MAE by cutoff on D-1 is 2,003 MW (06:00), 2,022 MW (09:20), 1,884 MW (12:00) and 1,859 MW (16:00). Try it with the cutoff control in the app.

---

## 3. Using the app

The **decision cutoff** control (top right) sets the time on D-1 at which purchases are made. Every number on both pages recalculates for it. Default: 09:20 UK time.

### Day-ahead outlook
Pick a delivery day (2 Jan – 1 Feb) with the dropdown or the ‹ › buttons.

| Element | What it shows |
|---|---|
| Blue callout | Decision deadline, which forecast run was available at that moment, and how many hours ahead it looked |
| **Expected wind energy** | Total forecast wind for the day (GWh) |
| **Peak / lowest hour** | Highest and lowest forecast hour (GW) |
| **Bias-adjusted energy** | Day total after removing the recent average forecast error |
| **Likely hourly range (P10–P90)** | How far actual wind typically lands below or above the forecast |
| Hourly chart | Forecast (blue), likely range (shaded), bias-adjusted forecast (green dashed), actual (orange, hindsight). Layers toggle with the chips |
| Forecast evolution | Every forecast run that covered the day; runs published after the cutoff are grey |
| How it turned out | Hindsight check: actual energy, day's error, and the gain from the bias adjustment |

**Show table** on any chart switches to the exact values. Hourly table columns:

| Column | Meaning |
|---|---|
| Forecast | Forecast available at the cutoff (MW) |
| P10 / P90 | 80% likely range: only a 10% chance actual is below P10, and 10% that it's above P90 |
| Bias-adj. | Forecast minus the mean error of the last 7 settled days |
| Actual | Measured wind generation (known only after delivery) |
| Error | Forecast − actual. Positive means less wind than forecast (shortfall risk) |
| Horizon | Hours between the forecast's publish time and the delivery hour |

### Forecast accuracy
Month-level KPI tiles, plain-English takeaways, error vs forecast horizon (decision window shaded), error distribution, forecast vs actual scatter, daily error (raw vs bias-adjusted), and error by hour of day. Every chart has a table view.

---

## 4. Methodology and assumptions

| Topic | Choice |
|---|---|
| Data | Elexon BMRS only: `FUELHH` filtered to `fuelType = WIND` (actuals) and `WINDFOR` (forecasts). National level. Fields used: `startTime`, `publishTime`, `generation`. |
| Scope | Purchase decisions made 1–31 Jan 2026 → **delivery days 2 Jan – 1 Feb 2026** (UK local days). Late-December data is also loaded, solely as history for the trailing statistics below. |
| Decision cutoff | Default **09:20 Europe/London on D-1**, the GB day-ahead auction gate closure. Configurable per request. |
| Decision forecast | For each delivery hour, the forecast from the **latest run with `publishTime` ≤ cutoff** that covers that hour. With the default cutoff this is the 07:30 UTC run on D-1; the 09:30 run arrives after gate closure. |
| Resolution | WINDFOR is hourly and FUELHH half-hourly. Compared at hourly target times, using the half-hour that **starts** on the hour. |
| Error sign | `error = forecast − actual`. Positive means wind came in below forecast (shortfall risk). |
| Bias adjustment | `forecast − mean error of the last 7 delivery days fully settled by the cutoff` (D-2 … D-8). |
| Uncertainty band | P10 / P90 of `actual − forecast` over the **last 14 settled days** (D-2 … D-15), added to the forecast. |
| No look-ahead | Both trailing statistics only use delivery days that ended before the cutoff on D-1, so they are reproducible at decision time. |
| Horizon analysis | All forecast runs (not just the decision run) for the January delivery hours, in 3-hour buckets. Only buckets covering ≥ 85% of hours are charted, because long horizons only exist for some hours of the day. |
| Time zones | Logic runs in UTC with `Europe/London` conversion. DST-aware (23- and 25-hour days are tested). |

The app performs **no machine learning or AI inference**. All analytics are transparent descriptive statistics.

---

## 5. Architecture and design decisions

```
            ┌───────────────────────── offline ─────────────────────────┐
 Elexon     │  backend/scripts/ingest.py  ──►  backend/data/snapshot.json │
 BMRS API ──┘  (chunked requests, retries)       (committed, ~1.6 MB)    │
                                                        │ loaded once, cached in memory
                                                        ▼
 Browser ── React + TypeScript ──── /api ────►  FastAPI
            views/DayAhead.tsx                   store.py     indexed in-memory data
            views/Accuracy.tsx                   forecast.py  decision-forecast rule
            Recharts                             metrics.py   MAE, RMSE, bias, quantiles
                                                 analysis.py  payloads, band, bias adjustment
```

| Deployment | How it is served |
|---|---|
| Docker Compose | `frontend` container (nginx) serves the built SPA and proxies `/api` to the `backend` container (uvicorn) |
| Vercel | Static build from `frontend/dist`; `api/index.py` exposes the same FastAPI app as a Python serverless function |
| Local dev | Vite dev server (`:5173`) proxies `/api` to uvicorn (`:8000`) |

**Design decisions**

- **Snapshot instead of live calls per request.** January 2026 is historical and immutable. Serving a committed snapshot keeps the app fast, deterministic and independent of Elexon availability. `ingest.py` regenerates it in seconds, and `verify_live.py` proves it matches the live API.
- **Plain Python analytics, no pandas.** About 2k actual and 29k forecast rows. Standard-library code keeps the serverless bundle small, cold starts fast, and the logic easy to unit test.
- **Business rule in one module.** `forecast.py` holds the cutoff and decision-forecast logic with no I/O, so it can be tested against synthetic data.
- **All routes under `/api`.** The same app works behind nginx, on Vercel and in dev without changes.
- **Caching.** Per-day and per-cutoff results are memoised with `lru_cache`. A month-level accuracy response computes in milliseconds after the first request.

---

## 6. API

Interactive docs: `/api/docs` (OpenAPI).

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/meta` | Delivery days, default cutoff, data provenance |
| `GET /api/day-ahead?day=YYYY-MM-DD&cutoff=HH:MM` | One delivery day: decision forecast, likely range, bias-adjusted forecast, actuals, forecast evolution |
| `GET /api/accuracy?cutoff=HH:MM` | Whole month: error metrics, band calibration, breakdowns by horizon, hour and day |

`cutoff` is optional (default `09:20`, UK local time on D-1). Invalid input returns `422`, and a day outside the scope returns `404`.

---

## 7. Repository layout

```
.
├── README.md                     project documentation (this file)
├── docker-compose.yml            runs the backend + frontend containers
├── vercel.json                   Vercel build, Python function and /api rewrite
├── requirements.txt              Python dependencies for the Vercel function
├── .vercelignore                 files excluded from Vercel uploads
├── .gitignore
├── .github/workflows/ci.yml      CI: backend tests, frontend lint + build, Docker build
├── api/
│   └── index.py                  Vercel serverless entrypoint (re-exports the FastAPI app)
├── backend/
│   ├── Dockerfile                python:3.12-slim image running uvicorn, with health check
│   ├── .dockerignore
│   ├── requirements.txt          runtime dependencies
│   ├── requirements-dev.txt      runtime + pytest
│   ├── pytest.ini
│   ├── app/
│   │   ├── main.py               FastAPI app, routes, input validation, CORS, gzip
│   │   ├── config.py             scope dates, default cutoff, trailing windows, env settings
│   │   ├── elexon.py             Elexon API client (chunked requests, retries)
│   │   ├── store.py              loads the snapshot into an indexed in-memory structure
│   │   ├── forecast.py           business rules: cutoff, delivery hours, decision forecast
│   │   ├── metrics.py            error statistics, quantiles, histogram
│   │   └── analysis.py           API payloads, bias adjustment, uncertainty band, breakdowns
│   ├── scripts/
│   │   ├── ingest.py             pulls Elexon data into data/snapshot.json
│   │   └── verify_live.py        independent check of the running app against live Elexon
│   ├── data/
│   │   └── snapshot.json         Elexon data snapshot (17 Dec 2025 – 2 Feb 2026)
│   └── tests/
│       ├── test_forecast.py      decision rule, cutoff edge cases, DST, evolution
│       ├── test_metrics.py       metrics against hand-computed values
│       ├── test_analysis.py      no look-ahead in bias adjustment and band
│       └── test_api.py           endpoints against the snapshot, validation, calibration
└── frontend/
    ├── Dockerfile                multi-stage: Node build → nginx
    ├── nginx.conf                serves the SPA, proxies /api to the backend
    ├── .dockerignore
    ├── index.html
    ├── package.json, package-lock.json
    ├── vite.config.ts            build chunks, dev proxy /api → localhost:8000
    ├── tsconfig*.json            TypeScript configuration
    ├── eslint.config.js          lint rules
    ├── public/favicon.svg
    └── src/
        ├── main.tsx              React entry point
        ├── App.tsx               shell: header, tabs, global cutoff control
        ├── api.ts                typed API client and response types
        ├── useAsync.ts           data-loading hook (loading / error state)
        ├── theme.ts              colour-blind-safe chart palette (light / dark)
        ├── format.ts             number and date formatting, axis ticks
        ├── index.css             design tokens, layout, light / dark themes
        ├── components/ui.tsx     tiles, cards, legend, tooltip, table toggle
        └── views/
            ├── DayAhead.tsx      day-ahead outlook page
            └── Accuracy.tsx      forecast accuracy page
```

---

## 8. Getting started

### Option A: Docker (recommended)

Prerequisite: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

| URL | |
|---|---|
| http://localhost:8080 | the app |
| http://localhost:8000/api/docs | API docs |

Stop with `Ctrl+C`, or run `docker compose down`.

### Option B: Local development

Prerequisites: Python 3.12+, Node.js 20+.

```bash
# 1. Backend (terminal 1)
python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt
cd backend
uvicorn app.main:app --reload --port 8000

# 2. Frontend (terminal 2)
cd frontend
npm install
npm run dev                            # http://localhost:5173 (proxies /api to :8000)
```

### Refresh the data snapshot (optional)

```bash
cd backend && python -m scripts.ingest
```

### Deploy to Vercel

```bash
npx vercel login
npx vercel --prod                      # run from the repository root
```

`vercel.json` builds the frontend, deploys `api/index.py` as a Python function (bundling `backend/app` and `backend/data`), and routes `/api/*` to it.

---

## 9. Testing and verification

```bash
cd backend && pytest -q                       # 25 tests
cd frontend && npm run lint && npm run build  # lint + type check + production build
```

| Test file | Covers |
|---|---|
| `test_forecast.py` | Cutoff in GMT and BST, 23/24/25-hour days, latest run before cutoff, run exactly at cutoff, fallback to an older run, no forecast available, error sign and horizon, forecast evolution |
| `test_metrics.py` | MAE, RMSE, bias, normalised MAE and quantiles against hand-computed values; histogram binning; empty and mismatched inputs |
| `test_analysis.py` | Bias adjustment and uncertainty band use only days settled before the cutoff, and match a manual recalculation |
| `test_api.py` | All endpoints against the January snapshot, the gate-closure rule, later cutoffs, validation errors (404/422), band calibration |

**Independent check against live Elexon data.** With the app running:

```bash
python backend/scripts/verify_live.py         # default target http://localhost:8080/api
```

This downloads the data from Elexon again and re-derives every decision forecast without importing any app code, then compares the result with the app's API. Latest result: **31 days / 744 hours, 0 mismatches, MAE identical (2,022.5 MW)**.

CI (`.github/workflows/ci.yml`) runs the backend tests, the frontend lint and build, and `docker compose build` on every push.

---

## 10. Configuration

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `CORS_ORIGINS` | backend | `*` | Comma-separated allowed origins |
| `DATA_DIR` | backend | `backend/data` | Location of `snapshot.json` |
| `ELEXON_BASE_URL` | backend (ingest) | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon API base URL |
| `VITE_API_BASE` | frontend (build) | same origin | Base URL of the API, if hosted separately |
| `VITE_API_PROXY` | frontend (dev) | `http://localhost:8000` | Target of the dev-server `/api` proxy |

Analysis parameters (default cutoff, trailing window lengths, scope dates) are in `backend/app/config.py`.

---

## 11. Development practices

- **Core rule isolated and tested.** The "what was known at decision time" logic is pure, side-effect free and covered by edge-case tests.
- **No look-ahead, enforced by tests.** Trailing statistics only use days settled before the cutoff (`test_analysis.py`).
- **Independent verification.** `verify_live.py` cross-checks the app against the source API with separate code.
- **Validated inputs and typed contracts.** FastAPI validates query parameters, and the TypeScript interfaces in `api.ts` mirror the API payloads.
- **Reproducible environments.** Pinned Python and npm dependencies, Docker images, and CI on every push.
- **Accessible UI.** A colour-blind-validated palette, legends on multi-series charts, a table view for every chart, light and dark themes, and a responsive layout.

---

## 12. Requirements coverage

| Requirement | Where it is met |
|---|---|
| Show the latest forecasts available when day-ahead decisions are made | Day-ahead outlook; `forecast.decision_forecast` |
| Evaluate forecast accuracy quantitatively | Forecast accuracy page; `metrics.py`, `analysis.accuracy` |
| National wind only, Elexon `FUELHH` (WIND) and `WINDFOR` | `elexon.py`, `ingest.py` |
| Only decisions made in January 2026 | Delivery days 2 Jan – 1 Feb 2026 (`config.py`) |
| React frontend, Python backend | `frontend/` (React + TypeScript), `backend/` (FastAPI) |
| Docker | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| Deployed on Vercel or Heroku | https://kx7qwm.vercel.app (`vercel.json`, `api/index.py`); auto-deploys on every push to `main` |
| README: files and directories, how to start, app link | Sections 7, 8 and the header |
| AI tool usage disclosed | Section 14 |

---

## 13. Limitations and next steps

- **Explain the systematic bias.** Investigate the WINDFOR vs FUELHH gap (curtailment, embedded generation, metering scope) using Elexon and NESO metadata.
- **From wind to volume.** Add the client's demand forecast so the portal shows the volume to procure directly.
- **Live operation.** Scheduled ingestion into a database (e.g. PostgreSQL) instead of a static snapshot, plus alerting when a new forecast run moves materially.
- **Decision support.** Recommend a purchase volume from the forecast distribution and the client's imbalance-price exposure.
- **More sources.** Extend the same approach to solar.

---

## 14. AI usage

As the challenge permits, this project was developed with the assistance of an AI coding tool (Claude Code by Anthropic). It was used for domain research, implementation, tests and documentation. The design, analysis and results were reviewed and verified by running the application, the test suite and the independent Elexon cross-check. The application itself uses no AI.

---

## 15. Data attribution

Contains BMRS data © Elexon Limited copyright and database right 2026. Data is sourced from the [Elexon Insights Solution API](https://bmrs.elexon.co.uk/api-documentation): datasets [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream) and [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream).
