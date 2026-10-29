import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { api, type Accuracy as AccuracyData } from '../api'
import { Card, ErrorState, Legend, Loading, Tile, TooltipBox } from '../components/ui'
import { useAsync } from '../useAsync'
import { fmtDay, fmtGW, fmtMW, fmtPct, fmtSignedGW, niceTicks, tickK } from '../format'
import { useChartColors, type ChartColors } from '../theme'

export default function Accuracy({ cutoff }: { cutoff: string }) {
  const { data, error, loading } = useAsync(() => api.accuracy(cutoff), [cutoff])
  const c = useChartColors()

  return (
    <>
      <div className="page-head">
        <h1>How far can you trust the forecast?</h1>
        <p>
          Every decision-time forecast for January 2026 delivery days (2 Jan – 1 Feb) compared with what the wind actually
          generated: 744 delivery hours.
        </p>
      </div>
      {error && <ErrorState message={error} />}
      {!data && loading && <Loading what="accuracy analysis" />}
      {data && (
        <div className="stack" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <Content data={data} c={c} />
        </div>
      )}
    </>
  )
}

function Content({ data, c }: { data: AccuracyData; c: ChartColors }) {
  const o = data.overall
  const a = data.adjusted
  const improvement = 1 - a.mae / o.mae
  const overShare = data.scatter.filter((p) => p.forecast > p.actual).length / data.scatter.length
  const dh = data.decisionHorizon

  // Long horizons only exist for some delivery hours, so their sample is biased; keep near-complete buckets.
  const maxN = Math.max(...data.byHorizon.map((h) => h.n))
  const horizonRows = data.byHorizon.filter((h) => h.n >= 0.85 * maxN).map((h) => ({ ...h, label: `${h.fromHours}–${h.toHours} h`, mid: (h.fromHours + h.toHours) / 2 }))
  const inWindow = data.byHorizon.filter((h) => h.toHours > dh.min && h.fromHours < dh.max)
  const horizonTicks = niceTicks(Math.max(...horizonRows.map((h) => Math.max(h.mae, h.bias))))
  const windowMae = inWindow.reduce((s, h) => s + h.mae * h.n, 0) / inWindow.reduce((s, h) => s + h.n, 0)
  const shortest = data.byHorizon[0]
  const worstHour = data.byHour.reduce((w, h) => (h.mae > w.mae ? h : w))
  const worstDay = data.daily.reduce((w, d) => (d.mae > w.mae ? d : w))

  return (
    <>
      <div className="grid tiles">
        <Tile hero label="Typical error (MAE)" value={fmtGW(o.mae, 2)} sub={`${fmtPct(o.nmae)} of average wind output (${fmtGW(o.meanActual)})`} />
        <Tile label="Systematic bias" value={fmtSignedGW(o.bias)} sub={`forecast too high in ${fmtPct(overShare)} of hours`} />
        <Tile label="9 in 10 hours within" value={`±${fmtGW(o.p90AbsError)}`} sub={`worst hour off by ${fmtGW(o.maxAbsError)}`} />
        <Tile label="RMSE" value={fmtGW(o.rmse, 2)} sub="penalises large misses" />
        <Tile
          label="Bias-adjusted MAE"
          value={fmtGW(a.mae, 2)}
          sub={<span className="good">{fmtPct(improvement)} lower error · bias {fmtSignedGW(a.bias)}</span>}
        />
      </div>

      <Card title="Key takeaways for the trading desk">
        <ul className="insights">
          <li>
            At the {data.cutoffLocal} cutoff on D-1, the forecast you trade on is typically off by {fmtMW(o.mae)} per hour,
            about {fmtPct(o.nmae)} of average wind output.
          </li>
          <li>
            The error is not random. Forecasts came in too high in {fmtPct(overShare)} of hours, by {fmtMW(o.bias)} on average.
            Relying on the raw forecast systematically under-buys and leaves the book short.
          </li>
          <li>
            Correcting each day's forecast by the average error of the previous {data.trailingBiasDays} settled days (known at
            decision time) cuts the typical error by {fmtPct(improvement)}, to {fmtMW(a.mae)}.
          </li>
          <li>
            The likely range shown on the day-ahead view, built only from the previous {data.band.days} settled days, contained
            the actual wind in {fmtPct(data.band.coverage)} of hours (target {fmtPct(data.band.target)}), so it can be relied on for
            sizing risk.
          </li>
          <li>
            To cover 9 in 10 hours, hold a buffer of about {fmtGW(o.p90AbsError)} around the forecast. The tails are wide: the
            single worst hour missed by {fmtGW(o.maxAbsError)}.
          </li>
          <li>
            Accuracy improves closer to delivery: {fmtMW(shortest.mae)} at {shortest.fromHours}–{shortest.toHours} h ahead vs{' '}
            {fmtMW(windowMae)} at the {dh.min}–{dh.max} h horizon of a day-ahead decision. Re-balancing intraday captures that gain.
          </li>
          <li>
            Hardest hour of the day: {String(worstHour.hour).padStart(2, '0')}:00 (MAE {fmtMW(worstHour.mae)}). Hardest day:{' '}
            {fmtDay(worstDay.day)} (MAE {fmtMW(worstDay.mae)}).
          </li>
        </ul>
      </Card>

      <Card
        title="Error grows with forecast horizon"
        subtitle="All forecast runs for the January delivery hours, grouped by how far ahead they were made. The shaded window is the horizon your day-ahead decision uses. Shows horizons covering at least 85% of hours."
        table={
          <table>
            <thead>
              <tr><th>Horizon</th><th>MAE</th><th>Bias</th><th>P90 |error|</th><th>Hours</th></tr>
            </thead>
            <tbody>
              {data.byHorizon.map((h) => (
                <tr key={h.fromHours}><td>{h.fromHours}–{h.toHours} h</td><td>{fmtMW(h.mae)}</td><td>{fmtMW(h.bias)}</td><td>{fmtMW(h.p90AbsError)}</td><td>{h.n}</td></tr>
              ))}
            </tbody>
          </table>
        }
      >
        <Legend
          items={[
            { label: 'Mean absolute error', color: c.forecast },
            { label: 'Bias (forecast − actual)', color: c.actual },
            { label: 'Day-ahead decision window', color: c.bandFill, kind: 'box' },
          ]}
        />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={horizonRows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <ReferenceArea x1={dh.min} x2={dh.max} fill={c.bandFill} stroke="none" ifOverflow="extendDomain" />
            <XAxis
              dataKey="mid"
              type="number"
              domain={[0, horizonRows[horizonRows.length - 1].toHours]}
              ticks={[0, 12, 24, 36, 48, 60].filter((t) => t <= horizonRows[horizonRows.length - 1].toHours)}
              tickFormatter={(v) => `${v} h`}
              tick={{ fill: c.muted, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: c.axis }}
            />
            <YAxis tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} ticks={horizonTicks} domain={[0, horizonTicks[horizonTicks.length - 1]]} />
            <Tooltip
              cursor={{ stroke: c.axis }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const h = payload[0].payload as (typeof horizonRows)[number]
                return (
                  <TooltipBox
                    title={`${h.label} ahead`}
                    rows={[
                      { label: 'MAE', color: c.forecast, value: fmtMW(h.mae) },
                      { label: 'Bias', color: c.actual, value: fmtMW(h.bias) },
                      { label: 'Sample', value: `${h.n} hours` },
                    ]}
                  />
                )
              }}
            />
            <Line dataKey="mae" stroke={c.forecast} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            <Line dataKey="bias" stroke={c.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid two-col">
        <Histogram data={data} c={c} />
        <ScatterCard data={data} c={c} />
      </div>

      <div className="grid two-col">
        <DailyCard data={data} c={c} />
        <HourCard data={data} c={c} />
      </div>
    </>
  )
}

function Histogram({ data, c }: { data: AccuracyData; c: ChartColors }) {
  const rows = data.histogram.map((b) => ({ ...b, mid: b.from + (b.to - b.from) / 2 }))
  const n = data.overall.n
  const xTicks = niceTicks(data.histogram[data.histogram.length - 1].to, data.histogram[0].from, 6)
  return (
    <Card
      title="Distribution of forecast errors"
      subtitle="Hours by error size (forecast − actual). Right of zero means wind came in below forecast and the book was short."
      table={
        <table>
          <thead><tr><th>Error range</th><th>Hours</th><th>Share</th></tr></thead>
          <tbody>
            {data.histogram.map((b) => (
              <tr key={b.from}><td>{fmtMW(b.from)} to {fmtMW(b.to)}</td><td>{b.count}</td><td>{fmtPct(b.count / n)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 20, right: 12, bottom: 4, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="mid" type="number" ticks={xTicks} domain={[xTicks[0], xTicks[xTicks.length - 1]]} tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} />
          <YAxis tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
          <ReferenceLine x={0} stroke={c.textSecondary} strokeDasharray="3 3" label={{ value: 'no error', fill: c.muted, fontSize: 11, position: 'top' }} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload as (typeof rows)[number]
              return <TooltipBox title={`${fmtMW(b.from)} to ${fmtMW(b.to)}`} rows={[{ label: 'Hours', value: `${b.count} (${fmtPct(b.count / n)})` }]} />
            }}
          />
          <Bar dataKey="count" fill={c.forecast} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

function ScatterCard({ data, c }: { data: AccuracyData; c: ChartColors }) {
  const ticks = useMemo(() => niceTicks(Math.max(...data.scatter.flatMap((p) => [p.forecast, p.actual]))), [data])
  const max = ticks[ticks.length - 1]
  return (
    <Card title="Forecast vs actual" subtitle="Each dot is one delivery hour: forecast (across) vs actual (up), in MW. Dots below the diagonal are hours where the forecast was too high.">
      <ResponsiveContainer width="100%" height={260}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke={c.grid} />
          <XAxis dataKey="forecast" type="number" domain={[0, max]} ticks={ticks} tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} label={{ value: 'Forecast (MW)', position: 'insideBottom', offset: -10, fill: c.muted, fontSize: 12 }} />
          <YAxis dataKey="actual" type="number" domain={[0, max]} ticks={ticks} tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={c.textSecondary} strokeDasharray="4 4" />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as { forecast: number; actual: number }
              return (
                <TooltipBox
                  title="Delivery hour"
                  rows={[
                    { label: 'Forecast', value: fmtMW(p.forecast) },
                    { label: 'Actual', value: fmtMW(p.actual) },
                    { label: 'Error', value: fmtMW(p.forecast - p.actual) },
                  ]}
                />
              )
            }}
          />
          <Scatter data={data.scatter} fill={c.forecast} fillOpacity={0.45} shape="circle" isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
    </Card>
  )
}

function DailyCard({ data, c }: { data: AccuracyData; c: ChartColors }) {
  const rows = data.daily.map((d) => ({ ...d, label: fmtDay(d.day) }))
  const yTicks = niceTicks(Math.max(...data.daily.flatMap((d) => [d.mae, d.adjustedMae])))
  return (
    <Card
      title="Daily error: raw vs bias-adjusted"
      subtitle={`Mean absolute error per delivery day. The adjustment uses only the previous ${data.trailingBiasDays} settled days.`}
      table={
        <table>
          <thead><tr><th>Delivery day</th><th>Forecast</th><th>Actual</th><th>MAE</th><th>Adj. MAE</th><th>Bias</th></tr></thead>
          <tbody>
            {data.daily.map((d) => (
              <tr key={d.day}><td>{fmtDay(d.day)}</td><td>{fmtGW(d.forecastMWh / 24)}</td><td>{fmtGW(d.actualMWh / 24)}</td><td>{fmtMW(d.mae)}</td><td>{fmtMW(d.adjustedMae)}</td><td>{fmtMW(d.bias)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Legend
        items={[
          { label: 'Decision forecast', color: c.forecast },
          { label: 'Bias-adjusted', color: c.adjusted, kind: 'dashed' },
        ]}
      />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} interval={6} />
          <YAxis tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip content={<DailyTooltip c={c} />} cursor={{ stroke: c.axis }} />
          <Line dataKey="mae" stroke={c.forecast} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="adjustedMae" stroke={c.adjusted} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}

function DailyTooltip({ active, payload, c }: TooltipProps<number, string> & { c: ChartColors }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as AccuracyData['daily'][number]
  return (
    <TooltipBox
      title={fmtDay(d.day)}
      rows={[
        { label: 'MAE', color: c.forecast, value: fmtMW(d.mae) },
        { label: 'Bias-adjusted MAE', color: c.adjusted, kind: 'dashed', value: fmtMW(d.adjustedMae) },
        { label: 'Bias', value: fmtMW(d.bias) },
      ]}
    />
  )
}

function HourCard({ data, c }: { data: AccuracyData; c: ChartColors }) {
  const rows = data.byHour.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, '0')}:00` }))
  const yTicks = niceTicks(Math.max(...data.byHour.map((h) => h.mae)))
  return (
    <Card
      title="Error by hour of day"
      subtitle="Mean absolute error of the decision forecast for each delivery hour (UK time)."
      table={
        <table>
          <thead><tr><th>Hour</th><th>MAE</th><th>Bias</th><th>P90 |error|</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.hour}><td>{h.label}</td><td>{fmtMW(h.mae)}</td><td>{fmtMW(h.bias)}</td><td>{fmtMW(h.p90AbsError)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={264}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={{ stroke: c.axis }} interval={3} />
          <YAxis tickFormatter={tickK} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} axisLine={false} width={44} ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const h = payload[0].payload as (typeof rows)[number]
              return (
                <TooltipBox
                  title={h.label}
                  rows={[
                    { label: 'MAE', color: c.forecast, kind: 'box', value: fmtMW(h.mae) },
                    { label: 'Bias', value: fmtMW(h.bias) },
                  ]}
                />
              )
            }}
          />
          <Bar dataKey="mae" fill={c.forecast} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}
