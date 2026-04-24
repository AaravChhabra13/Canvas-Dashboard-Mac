import { useState, useEffect, useCallback } from 'react'
import type { Assignment, BucketedAssignments, Settings, SyncState } from '../shared/types'

// ── Bucketing ────────────────────────────────────────────────────────────────

function bucketAssignments(list: Assignment[]): BucketedAssignments {
  const now = new Date()

  const todayEnd = new Date(now)
  todayEnd.setHours(23, 59, 59, 999)

  const tomorrowStart = new Date(now)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  tomorrowStart.setHours(0, 0, 0, 0)

  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setHours(23, 59, 59, 999)

  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  weekEnd.setHours(23, 59, 59, 999)

  return {
    overdue: list.filter(a => a.isOverdue && a.dueAt !== null),
    today: list.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d >= now && d <= todayEnd
    }),
    tomorrow: list.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d >= tomorrowStart && d <= tomorrowEnd
    }),
    thisWeek: list.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d > tomorrowEnd && d <= weekEnd
    }),
    comingUp: list.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      return new Date(a.dueAt) > weekEnd
    }),
    noDueDate: list.filter(a => a.dueAt === null),
  }
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatDue(iso: string): string {
  const d = new Date(iso)
  const now = new Date()

  const isToday = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced'
  const d = new Date(iso)
  return `Updated ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

// ── Sub-components ───────────────────────────────────────────────────────────

function AssignmentRow({ a }: { a: Assignment }) {
  const handleClick = () => {
    if (a.canvasUrl) window.ipcRenderer.send('open-external', a.canvasUrl)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 14px',
        gap: 9,
        cursor: a.canvasUrl ? 'pointer' : 'default',
        borderRadius: 6,
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (a.canvasUrl) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.06)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.background = ''
      }}
    >
      {/* Course color dot */}
      <div style={{
        width: 7, height: 7,
        borderRadius: '50%',
        background: a.courseColor,
        flexShrink: 0,
      }} />

      {/* Title */}
      <span style={{
        flex: 1,
        fontSize: 13,
        color: '#1a1a1a',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {a.title}
      </span>

      {/* Due time */}
      {a.dueAt && (
        <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>
          {formatDue(a.dueAt)}
        </span>
      )}

      {/* Submission badge */}
      {a.submissionState === 'submitted' && (
        <span style={{ fontSize: 12, color: '#22c55e', flexShrink: 0 }}>✓</span>
      )}
    </div>
  )
}

const BUCKET_META: Array<{
  key: keyof BucketedAssignments
  label: string
  color: string
}> = [
  { key: 'overdue',  label: 'Overdue',      color: '#ef4444' },
  { key: 'today',    label: 'Due Today',    color: '#f97316' },
  { key: 'tomorrow', label: 'Due Tomorrow', color: '#eab308' },
  { key: 'thisWeek', label: 'This Week',    color: '#22c55e' },
  { key: 'comingUp', label: 'Coming Up',    color: '#3b82f6' },
  { key: 'noDueDate',label: 'No Due Date',  color: '#9ca3af' },
]

function BucketSection({ label, color, items }: { label: string; color: string; items: Assignment[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '5px 14px 3px', gap: 6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#888',
          textTransform: 'uppercase', letterSpacing: 0.6,
        }}>
          {label} · {items.length}
        </span>
      </div>
      {items.map(a => <AssignmentRow key={a.id} a={a} />)}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function Panel() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [syncState, setSyncState]     = useState<SyncState>({ status: 'idle', lastSyncAt: null })
  const [settings, setSettings]       = useState<Settings>({ canvasIcalUrl: '', syncIntervalMinutes: 30, lookaheadDays: 14 })
  const [showSettings, setShowSettings] = useState(false)
  const [urlDraft, setUrlDraft]         = useState('')

  // Load initial state from main process
  useEffect(() => {
    window.ipcRenderer.invoke('assignments:get').then((data: Assignment[]) => setAssignments(data))
    window.ipcRenderer.invoke('sync:status:get').then((s: SyncState) => setSyncState(s))
    window.ipcRenderer.invoke('settings:get').then((s: Settings) => {
      setSettings(s)
      setUrlDraft(s.canvasIcalUrl)
    })
  }, [])

  // Subscribe to push events from main process
  useEffect(() => {
    const onData    = (_: unknown, data: Assignment[]) => setAssignments(data)
    const onStatus  = (_: unknown, s: SyncState)       => setSyncState(s)
    const onShown   = () => {
      // Re-fetch fresh state whenever panel becomes visible
      window.ipcRenderer.invoke('assignments:get').then((data: Assignment[]) => setAssignments(data))
      window.ipcRenderer.invoke('sync:status:get').then((s: SyncState) => setSyncState(s))
    }

    window.ipcRenderer.on('assignments:data',     onData)
    window.ipcRenderer.on('sync:status',          onStatus)
    window.ipcRenderer.on('panel:shown',          onShown)

    return () => {
      window.ipcRenderer.off('assignments:data',   onData)
      window.ipcRenderer.off('sync:status',        onStatus)
      window.ipcRenderer.off('panel:shown',        onShown)
    }
  }, [])

  const triggerSync = useCallback(() => {
    window.ipcRenderer.send('sync:trigger')
  }, [])

  const saveUrl = useCallback(async () => {
    const trimmed = urlDraft.trim()
    const updated = await window.ipcRenderer.invoke('settings:set', { canvasIcalUrl: trimmed }) as Settings
    setSettings(updated)
    setUrlDraft(updated.canvasIcalUrl)
    setShowSettings(false)
  }, [urlDraft])

  const bucketed = bucketAssignments(assignments)
  const overdueCount = bucketed.overdue.length
  const todayCount   = bucketed.today.length
  const badgeCount   = overdueCount + todayCount
  const totalCount   = assignments.length

  const syncColor =
    syncState.status === 'syncing' ? '#3b82f6'
    : syncState.status === 'error' ? '#ef4444'
    : 'transparent'

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(249,249,249,0.96)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, sans-serif',
      WebkitUserSelect: 'none',
      userSelect: 'none',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '11px 14px 9px',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111', letterSpacing: -0.2 }}>
          Canvas Dashboard
        </span>

        {badgeCount > 0 && (
          <span style={{
            marginLeft: 7,
            background: overdueCount > 0 ? '#ef4444' : '#f97316',
            color: '#fff',
            borderRadius: 10,
            fontSize: 10, fontWeight: 700,
            padding: '1px 6px',
            lineHeight: 1.4,
          }}>
            {badgeCount}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sync spinner / error dot */}
          {syncState.status !== 'idle' && (
            <span style={{ fontSize: 11, color: syncColor }}>
              {syncState.status === 'syncing' ? '↻' : '⚠'}
            </span>
          )}

          <button
            onClick={() => {
              setShowSettings(v => !v)
              setUrlDraft(settings.canvasIcalUrl)
            }}
            title="Settings"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 15, color: showSettings ? '#3b82f6' : '#aaa',
              padding: 0, lineHeight: 1,
            }}
          >⚙</button>
        </div>
      </div>

      {/* ── Settings drawer ── */}
      {showSettings && (
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          background: 'rgba(0,0,0,0.025)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 5, fontWeight: 500 }}>
            Canvas iCal Feed URL
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              value={urlDraft}
              onChange={e => setUrlDraft(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveUrl()}
              placeholder="https://canvas.uw.edu/feeds/calendars/user_….ics"
              style={{
                flex: 1, fontSize: 11,
                padding: '5px 7px',
                border: '1px solid #d1d5db',
                borderRadius: 5, outline: 'none',
                background: '#fff', color: '#111',
                WebkitUserSelect: 'text',
              }}
            />
            <button
              onClick={saveUrl}
              style={{
                fontSize: 11, padding: '5px 10px',
                background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: 5, cursor: 'pointer',
                fontWeight: 600,
              }}
            >Save</button>
          </div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 5 }}>
            Canvas › Calendar › Calendar Feed (bottom of page)
          </div>
        </div>
      )}

      {/* ── Assignment list ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {totalCount === 0 ? (
          <div style={{ padding: '28px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
            <div style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>All clear!</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              {!settings.canvasIcalUrl
                ? 'Tap ⚙ above to add your Canvas iCal feed URL.'
                : syncState.status === 'error'
                  ? `Sync error: ${syncState.error ?? 'unknown'}`
                  : 'No upcoming assignments in your feed.'}
            </div>
          </div>
        ) : (
          BUCKET_META.map(({ key, label, color }) => (
            <BucketSection
              key={key}
              label={label}
              color={color}
              items={bucketed[key]}
            />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        borderTop: '1px solid rgba(0,0,0,0.08)',
        padding: '7px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, color: '#bbb' }}>
          {formatLastSync(syncState.lastSyncAt)}
        </span>
        <button
          onClick={triggerSync}
          disabled={syncState.status === 'syncing'}
          style={{
            fontSize: 11, padding: '3px 9px',
            background: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 5, cursor: syncState.status === 'syncing' ? 'default' : 'pointer',
            color: '#555', fontWeight: 500,
            opacity: syncState.status === 'syncing' ? 0.5 : 1,
          }}
        >
          {syncState.status === 'syncing' ? 'Syncing…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
