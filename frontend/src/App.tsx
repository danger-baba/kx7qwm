import { useState } from 'react'
import { api } from './api'
import { ErrorState, Loading } from './components/ui'
import { useAsync } from './useAsync'
import Accuracy from './views/Accuracy'
import DayAhead from './views/DayAhead'

type View = 'day-ahead' | 'accuracy'

const VIEWS: { id: View; label: string }[] = [
  { id: 'day-ahead', label: 'Day-ahead outlook' },
  { id: 'accuracy', label: 'Forecast accuracy' },
]

export default function App() {
  const meta = useAsync(() => api.meta(), [])
  const [view, setView] = useState<View>(() => (location.hash === '#accuracy' ? 'accuracy' : 'day-ahead'))
  const [cutoff, setCutoff] = useState<string | null>(null)
  const effectiveCutoff = cutoff ?? meta.data?.defaultCutoff ?? '09:20'

  const select = (v: View) => {
    setView(v)
    history.replaceState(null, '', `#${v}`)
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/favicon.svg" alt="" />
            <div>
              Wind Forecast Desk
              <small>GB national wind · day-ahead procurement</small>
            </div>
          </div>
          <nav className="tabs" role="tablist">
            {VIEWS.map((v) => (
              <button key={v.id} role="tab" className="tab" aria-selected={view === v.id} onClick={() => select(v.id)}>
                {v.label}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <label className="cutoff-control" title="Time on the day before delivery by which purchases are made (UK local time)">
            Decision cutoff (D-1)
            <input
              className="input"
              type="time"
              value={effectiveCutoff}
              onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && setCutoff(e.target.value)}
            />
            {meta.data && effectiveCutoff !== meta.data.defaultCutoff && (
              <button className="link-btn" onClick={() => setCutoff(null)}>
                Reset
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="shell">
        {meta.error && <ErrorState message={meta.error} />}
        {meta.loading && <Loading what="portal" />}
        {meta.data &&
          (view === 'day-ahead' ? <DayAhead meta={meta.data} cutoff={effectiveCutoff} /> : <Accuracy cutoff={effectiveCutoff} />)}

        <footer className="footer">
          Data: Elexon BMRS (FUELHH wind outturn, WINDFOR forecasts), snapshot fetched {meta.data?.fetchedAt ?? '…'}. Default
          cutoff {meta.data?.defaultCutoff ?? '09:20'} UK time on D-1 (GB day-ahead auction gate closure). All times UK local.
        </footer>
      </main>
    </>
  )
}
