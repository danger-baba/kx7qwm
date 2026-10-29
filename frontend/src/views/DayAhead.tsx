import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { api, type DayAhead as DayAheadData, type Meta } from '../api'
import { Card, ErrorState, Legend, Loading, Tile, TooltipBox, type TooltipRow } from '../components/ui'
import { useAsync } from '../useAsync'
import { fmtDateTime, fmtDay, fmtDayLong, fmtGW, fmtGWh, fmtMW, fmtSignedGW, niceTicks, tickK } from '../format'
import { mix, useChartColors, type ChartColors } from '../theme'

type Layer = 'actual' | 'adjusted' | 'band'

export default function DayAhead({ meta, cutoff }: { meta: Meta; cutoff: string }) {
  const days = meta.deliveryDays
  const [day, setDay] = useState(days[Math.min(13, days.length - 1)])
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ actual: true, adjusted: true, band: true })
  const { data, error, loading } = useAsync(() => api.dayAhead(day, cutoff), [day, cutoff])
  const c = useChartColors()

  const idx = days.indexOf(day)
  const toggle = (k: Layer) => setLayers((l) => ({ ...l, [k]: !l[k] }))

  return (
    <>
      <div className="page-head">
        <h1>Day-ahead wind outlook</h1>
        <p>
          The wind forecast your desk had in hand at the decision cutoff, with a historically calibrated range, so you can
          see how much power to buy beyond expected wind.
        </p>
      </div>

      <div className="controls">
        <button className="icon-btn" aria-label="Previous day" disabled={idx <= 0} onClick={() => setDay(days[idx - 1])}>
          ‹
        </button>
        <label className="control">
          <span className="sr-only">Delivery day</span>
          <select className="select" value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                Delivery {fmtDay(d)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-btn"
          aria-label="Next day"
          disabled={idx >= days.length - 1}
          onClick={() => setDay(days[idx + 1])}
        >
          ›
        </button>
        <span style={{ flex: 1 }} />
        <Chip on={layers.band} onClick={() => toggle('band')} color={c.forecast} kind="box" label="Likely range" />
        <Chip on={layers.adjusted} onClick={() => toggle('adjusted')} color={c.adjusted} kind="dashed" label="Bias-adjusted" />
        <Chip on={layers.actual} onClick={() => toggle('actual')} color={c.actual} label="Actual (hindsight)" />
      </div>

      {error && <ErrorState message={error} />}
      {!data && loading && <Loading what="forecast" />}
      {data && <DayContent data={data} layers={layers} c={c} dim={loading} />}
    </>
  )
}

function Chip({ on, onClick, color, label, kind }: { on: boolean; onClick: () => void; color: string; label: string; kind?: string }) {
  return (
    <button className="chip" aria-pressed={on} onClick={onClick}>
      <i className={`key ${kind ?? 'line'}`} style={{ background: color, color }} />
      {label}
    </button>
  )
}

function DayContent({ data, layers, c, dim }: { data: DayAheadData; layers: Record<Layer, boolean>; c: ChartColors; dim: boolean }) {
  const s = data.summary
  const horizons = data.series.map((p) => p.horizonHours)
  const adjustedMWh = data.series.reduce((sum, p) => sum + p.adjusted, 0)
  const rows = data.series.map((p) => ({ ...p, band: [p.low, p.high] as [number, number] }))
  const hasActual = s.actualMWh != null
  const yTicks = niceTicks(Math.max(...data.series.flatMap((p) => [p.high, p.actual ?? 0])))

  return (
    <div className="stack" style={{ opacity: dim ? 0.6 : 1, transition: 'opacity .2s' }}>
      <div className="callout">
        <span className="icon">🕘</span>
        <span>
          For delivery on <b>{fmtDayLong(data.deliveryDay)}</b>, the decision is made by{' '}
          <b>{fmtDateTime(data.cutoffUtc)}</b> (UK time). The latest forecast available then was published at{' '}
          <b>{data.publishesUsed.map(fmtDateTime).join(', ')}</b>, looking {Math.min(...horizons)}–{Math.max(...horizons)} hours
          ahead.
        </span>
      </div>

      <div className="grid tiles">
        <Tile hero label="Expected wind energy" value={fmtGWh(s.forecastMWh)} sub={`avg ${fmtGW(s.forecastMWh / data.series.length)} across the day`} />
        <Tile label="Peak / lowest hour" value={`${fmtGW(s.peakForecast)} / ${fmtGW(s.minForecast)}`} sub="forecast wind output" />
        <Tile
          label="Bias-adjusted energy"
          value={fmtGWh(adjustedMWh)}
          sub={`recent forecasts ran ${fmtSignedGW(s.trailingBias)} vs actual`}
        />
        <Tile
          label="Likely hourly range (P10–P90)"
          value={`${fmtSignedGW(data.band.lowOffset)} … ${fmtSignedGW(data.band.highOffset)}`}
          sub={`actual vs forecast, based on the last ${data.band.days} settled days`}
        />
      </div>

      <Card
        title="Hourly wind forecast at decision time"
        subtitle={`MW by hour of delivery (UK time). The shaded band is where actual wind landed 80% of the time over the last ${data.band.days} settled days, relative to the forecast.`}
        table={<HourlyTable data={data} />}
      >
        <Legend
          items={[
            { label: 'Decision forecast', color: c.forecast },
            ...(layers.band ? [{ label: 'Likely range (P10–P90)', color: c.bandFill, kind: 'box' as const }] : []),
            ...(layers.adjusted ? [{ label: 'Bias-adjusted forecast', color: c.adjusted, kind: 'dashed' as const }] : []),
            ...(layers.actual && hasActual ? [{ label: 'Actual (known after delivery)', color: c.actual }] : []),
          ]}
        />
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="localHour" tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} interval={2} />
            <YAxis tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
            <Tooltip content={<HourTooltip c={c} layers={layers} />} cursor={{ stroke: c.axis }} />
            {layers.band && <Area dataKey="band" stroke="none" fill={c.bandFill} isAnimationActive={false} activeDot={false} />}
            <Line dataKey="forecast" stroke={c.forecast} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            {layers.adjusted && (
              <Line dataKey="adjusted" stroke={c.adjusted} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            )}
            {layers.actual && (
              <Line dataKey="actual" stroke={c.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid two-col">
        <Evolution data={data} c={c} />
        {hasActual && (
          <Card title="How it turned out" subtitle="Hindsight check for this delivery day: not available when the decision was made.">
            <div className="grid tiles" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <Tile label="Actual wind energy" value={fmtGWh(s.actualMWh)} sub={`forecast ${fmtGWh(s.forecastMWh)}`} />
              <Tile label="Average forecast error" value={fmtSignedGW(s.errors.bias)} sub={s.errors.bias > 0 ? 'forecast too high (shortfall risk)' : 'forecast too low (surplus)'} />
              <Tile label="Mean absolute error" value={fmtMW(s.errors.mae)} sub="decision forecast" />
              <Tile
                label="With bias adjustment"
                value={fmtMW(s.adjustedErrors.mae)}
                sub={
                  s.adjustedErrors.mae < s.errors.mae ? (
                    <span className="good">{Math.round((1 - s.adjustedErrors.mae / s.errors.mae) * 100)}% lower error</span>
                  ) : (
                    `${Math.round((s.adjustedErrors.mae / s.errors.mae - 1) * 100)}% higher error on this day`
                  )
                }
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function HourTooltip({ active, payload, c, layers }: TooltipProps<number, string> & { c: ChartColors; layers: Record<Layer, boolean> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as DayAheadData['series'][number]
  const rows: TooltipRow[] = [{ label: 'Forecast', color: c.forecast, value: fmtMW(p.forecast) }]
  if (layers.band) rows.push({ label: 'Likely range', color: c.bandFill, kind: 'box', value: `${fmtGW(p.low)}–${fmtGW(p.high)}` })
  if (layers.adjusted) rows.push({ label: 'Bias-adjusted', color: c.adjusted, kind: 'dashed', value: fmtMW(p.adjusted) })
  if (layers.actual && p.actual != null) {
    rows.push({ label: 'Actual', color: c.actual, value: fmtMW(p.actual) })
    rows.push({ label: 'Error (fc − actual)', value: fmtMW(p.error) })
  }
  return <TooltipBox title={`${p.localHour} · ${p.horizonHours} h ahead`} rows={rows} />
}

function Evolution({ data, c }: { data: DayAheadData; c: ChartColors }) {
  const decision = data.publishesUsed[data.publishesUsed.length - 1]
  const { rows, before, yTicks } = useMemo(() => {
    const rows = data.hours.map((h, i) => {
      const row: Record<string, number | string | null> = { hour: h, actual: data.series[i]?.actual ?? null }
      data.evolution.forEach((e, k) => (row[`p${k}`] = e.values[i]))
      return row
    })
    const all = data.evolution.flatMap((e) => e.values).concat(data.series.map((p) => p.actual ?? 0))
    return { rows, before: data.evolution.filter((e) => e.beforeCutoff).length, yTicks: niceTicks(Math.max(...all)) }
  }, [data])

  const colorFor = (k: number) => {
    const e = data.evolution[k]
    if (e.publishTime === decision) return c.forecast
    if (!e.beforeCutoff) return c.faint
    return mix(c.seqLight, c.seqDark, before > 1 ? k / (before - 1) : 1)
  }

  return (
    <Card
      title="How the forecast evolved"
      subtitle={`All ${data.evolution.length} forecast runs that covered this day. Later runs (grey) arrived after the cutoff, too late to trade on.`}
    >
      <Legend
        items={[
          { label: 'Earlier runs', color: mix(c.seqLight, c.seqDark, 0.5) },
          { label: 'Decision forecast', color: c.forecast },
          { label: 'After cutoff', color: c.faint },
          { label: 'Actual', color: c.actual },
        ]}
      />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} interval={3} />
          <YAxis tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip content={<EvolutionTooltip data={data} c={c} decision={decision} />} cursor={{ stroke: c.axis }} />
          {data.evolution.map((e, k) =>
            e.publishTime === decision ? null : (
              <Line key={e.publishTime} dataKey={`p${k}`} stroke={colorFor(k)} strokeWidth={1.25} dot={false} activeDot={false} isAnimationActive={false} />
            ),
          )}
          <Line dataKey="actual" stroke={c.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          {data.evolution.map((e, k) =>
            e.publishTime === decision ? (
              <Line key={e.publishTime} dataKey={`p${k}`} stroke={c.forecast} strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            ) : null,
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

function EvolutionTooltip({ active, payload, data, c, decision }: TooltipProps<number, string> & { data: DayAheadData; c: ChartColors; decision: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Record<string, number>
  const values = data.evolution.map((_, k) => row[`p${k}`])
  const d = data.evolution.findIndex((e) => e.publishTime === decision)
  const rows: TooltipRow[] = [
    { label: `First run (${fmtDateTime(data.evolution[0].publishTime)})`, color: mix(c.seqLight, c.seqDark, 0), value: fmtMW(values[0]) },
    { label: 'Decision forecast', color: c.forecast, value: fmtMW(values[d]) },
    { label: `Last run (${fmtDateTime(data.evolution[values.length - 1].publishTime)})`, color: c.faint, value: fmtMW(values[values.length - 1]) },
  ]
  if (row.actual != null) rows.push({ label: 'Actual', color: c.actual, value: fmtMW(row.actual) })
  return <TooltipBox title={`${row.hour}`} rows={rows} />
}

function HourlyTable({ data }: { data: DayAheadData }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Hour (UK)</th>
          <th>Forecast</th>
          <th>P10</th>
          <th>P90</th>
          <th>Bias-adj.</th>
          <th>Actual</th>
          <th>Error</th>
          <th>Horizon</th>
        </tr>
      </thead>
      <tbody>
        {data.series.map((p) => (
          <tr key={p.time}>
            <td>{p.localHour}</td>
            <td>{fmtMW(p.forecast)}</td>
            <td>{fmtMW(p.low)}</td>
            <td>{fmtMW(p.high)}</td>
            <td>{fmtMW(p.adjusted)}</td>
            <td>{fmtMW(p.actual)}</td>
            <td>{fmtMW(p.error)}</td>
            <td>{p.horizonHours} h</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
