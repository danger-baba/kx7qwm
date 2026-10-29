import { useEffect, useState } from 'react'

// Chart colors are resolved in JS because SVG attributes set by Recharts don't reliably accept var().
// Values follow the validated reference palette (categorical slots 1-3 + chrome), stepped per mode.
const LIGHT = {
  forecast: '#2a78d6',
  actual: '#eb6834',
  adjusted: '#1baf7a',
  bandFill: 'rgba(42,120,214,0.12)',
  muted: '#898781',
  faint: '#c3c2b7',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  surface: '#fcfcfb',
  seqLight: '#b7d3f6',
  seqDark: '#184f95',
}

const DARK: typeof LIGHT = {
  forecast: '#3987e5',
  actual: '#d95926',
  adjusted: '#199e70',
  bandFill: 'rgba(57,135,229,0.18)',
  muted: '#898781',
  faint: '#4a4a46',
  grid: '#2c2c2a',
  axis: '#383835',
  text: '#f0efec',
  textSecondary: '#c3c2b7',
  surface: '#1a1a19',
  seqLight: '#184f95',
  seqDark: '#86b6ef',
}

export type ChartColors = typeof LIGHT

const query = () => window.matchMedia('(prefers-color-scheme: dark)')

export function useChartColors(): ChartColors {
  const [dark, setDark] = useState(() => query().matches)
  useEffect(() => {
    const mq = query()
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark ? DARK : LIGHT
}

/** Interpolate between two hex colors (t in 0..1) — used for the forecast-vintage ramp. */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
