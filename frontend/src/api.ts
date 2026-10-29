// Typed client for the FastAPI backend. Same origin by default (/api), override with VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE ?? ''

export interface ErrorSummary {
  n: number
  mae: number
  rmse: number
  bias: number
  nmae: number | null
  meanActual: number
  p10: number
  p50: number
  p90: number
  p90AbsError: number
  maxAbsError: number
}

export interface Meta {
  deliveryDays: string[]
  decisionMonth: string
  timezone: string
  source: string
  fetchedAt: string
  publishCount: number
  defaultCutoff: string
}

export interface DayPoint {
  time: string
  localHour: string
  forecast: number
  adjusted: number
  low: number
  high: number
  actual: number | null
  error: number | null
  publishTime: string
  horizonHours: number
}

export interface DayAhead {
  deliveryDay: string
  cutoffLocal: string
  cutoffUtc: string
  publishesUsed: string[]
  band: { lowQuantile: number; highQuantile: number; lowOffset: number; highOffset: number; days: number }
  summary: {
    forecastMWh: number
    actualMWh: number | null
    peakForecast: number | null
    minForecast: number | null
    trailingBias: number
    errors: ErrorSummary
    adjustedErrors: ErrorSummary
  }
  series: DayPoint[]
  hours: string[]
  evolution: { publishTime: string; beforeCutoff: boolean; values: number[] }[]
}

export interface Accuracy {
  cutoffLocal: string
  overall: ErrorSummary
  adjusted: ErrorSummary
  trailingBiasDays: number
  band: { days: number; target: number; coverage: number }
  decisionHorizon: { min: number; max: number }
  histogram: { from: number; to: number; count: number }[]
  byHour: (ErrorSummary & { hour: number })[]
  byHorizon: { fromHours: number; toHours: number; n: number; mae: number; rmse: number; bias: number; p90AbsError: number }[]
  daily: (ErrorSummary & { day: string; forecastMWh: number; actualMWh: number; trailingBias: number; adjustedMae: number })[]
  scatter: { forecast: number; actual: number }[]
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/api${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  meta: () => get<Meta>('/meta'),
  dayAhead: (day: string, cutoff: string) => get<DayAhead>('/day-ahead', { day, cutoff }),
  accuracy: (cutoff: string) => get<Accuracy>('/accuracy', { cutoff }),
}
