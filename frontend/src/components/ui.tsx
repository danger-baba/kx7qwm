import { useState, type ReactNode } from 'react'

export function Tile({ label, value, sub, hero }: { label: string; value: ReactNode; sub?: ReactNode; hero?: boolean }) {
  return (
    <div className={`tile${hero ? ' hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export function Card({
  title,
  subtitle,
  table,
  children,
}: {
  title: string
  subtitle?: ReactNode
  /** Optional table view of the same data (accessibility + exact values). */
  table?: ReactNode
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {table && (
          <button className="link-btn" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </div>
      {showTable ? <div className="table-wrap">{table}</div> : children}
    </section>
  )
}

export type LegendItem = {
  label: string
  color: string
  kind?: 'line' | 'dashed' | 'box' | 'dot'
  /** When set, the item is a toggle button for its chart layer. */
  onToggle?: () => void
  on?: boolean
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((i) => {
        const key = <i className={`key ${i.kind ?? 'line'}`} style={{ background: i.color, color: i.color }} />
        return i.onToggle ? (
          <button key={i.label} className="legend-toggle" aria-pressed={i.on} onClick={i.onToggle} title="Show / hide">
            {key}
            {i.label}
          </button>
        ) : (
          <span key={i.label}>
            {key}
            {i.label}
          </span>
        )
      })}
    </div>
  )
}

export type TooltipRow = { label: string; color?: string; value: string; kind?: LegendItem['kind'] }

export function TooltipBox({ title, rows }: { title: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="tt">
      <div className="tt-title">{title}</div>
      {rows.map((r) => (
        <div className="tt-row" key={r.label}>
          <span className="name">
            {r.color && <i className={`key ${r.kind ?? 'line'}`} style={{ background: r.color, color: r.color }} />}
            {r.label}
          </span>
          <span className="val">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function Loading({ what }: { what: string }) {
  return <div className="state">Loading {what}…</div>
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="callout warn" role="alert">
      <span className="icon">⚠</span>
      <span>Couldn't load data: {message}</span>
    </div>
  )
}
