const UK = 'Europe/London'

export const fmtMW = (v: number | null | undefined) =>
  v == null ? '–' : `${Math.round(v).toLocaleString('en-GB')} MW`

export const fmtGW = (mw: number | null | undefined, digits = 1) =>
  mw == null ? '–' : `${(mw / 1000).toFixed(digits)} GW`

export const fmtGWh = (mwh: number | null | undefined) =>
  mwh == null ? '–' : `${(mwh / 1000).toLocaleString('en-GB', { maximumFractionDigits: 0 })} GWh`

export const fmtSignedGW = (mw: number) => `${mw >= 0 ? '+' : '−'}${(Math.abs(mw) / 1000).toFixed(2)} GW`

export const fmtPct = (v: number | null | undefined) => (v == null ? '–' : `${(v * 100).toFixed(0)}%`)

/** Compact axis ticks: 0 / 5K / 10K */
export const tickK = (v: number) => (Math.abs(v) >= 1000 ? `${v / 1000}K` : `${v}`)

export const fmtDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: UK })

export const fmtDayLong = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: UK })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: UK })

/** Round axis ticks from 0 (or a negative min) up past max, using a 1/2/2.5/5 × 10^n step. */
export function niceTicks(max: number, min = 0, target = 5): number[] {
  const span = Math.max(max - min, 1)
  const raw = span / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const ticks: number[] = []
  let t = Math.floor(min / step) * step
  ticks.push(t)
  while (t < max) ticks.push((t += step))
  return ticks
}
