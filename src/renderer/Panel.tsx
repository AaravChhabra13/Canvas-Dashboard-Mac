import { useState, useEffect, useCallback } from 'react'
import type { Assignment, BucketedAssignments, Course, Settings, SyncState } from '../shared/types'

// ── Bucketing ────────────────────────────────────────────────────────────────

function bucketAssignments(list: Assignment[], hiddenIds: Set<string>): BucketedAssignments {
  const visible = list.filter(a => !hiddenIds.has(a.courseId))
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
    overdue: visible.filter(a => a.isOverdue && a.dueAt !== null),
    today: visible.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d >= now && d <= todayEnd
    }),
    tomorrow: visible.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d >= tomorrowStart && d <= tomorrowEnd
    }),
    thisWeek: visible.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      const d = new Date(a.dueAt)
      return d > tomorrowEnd && d <= weekEnd
    }),
    comingUp: visible.filter(a => {
      if (!a.dueAt || a.isOverdue) return false
      return new Date(a.dueAt) > weekEnd
    }),
    noDueDate: visible.filter(a => a.dueAt === null),
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

// ── Submission badge ─────────────────────────────────────────────────────────

function SubmissionBadge({ state }: { state: Assignment['submissionState'] }) {
  if (state === 'submitted') {
    return <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }} title="Submitted">✓</span>
  }
  if (state === 'graded') {
    return <span style={{ fontSize: 11, color: '#3b82f6', flexShrink: 0 }} title="Graded">★</span>
  }
  return null
}

// ── Assignment row ───────────────────────────────────────────────────────────

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
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '' }}
    >
      {/* Course color dot */}
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.courseColor, flexShrink: 0 }} />

      {/* Title */}
      <span style={{
        flex: 1, fontSize: 13, color: '#1a1a1a',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {a.title}
      </span>

      {/* Due time */}
      {a.dueAt && (
        <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>
          {formatDue(a.dueAt)}
        </span>
      )}

      <SubmissionBadge state={a.submissionState} />
    </div>
  )
}

const BUCKET_META: Array<{ key: keyof BucketedAssignments; label: string; color: string }> = [
  { key: 'overdue',   label: 'Overdue',      color: '#ef4444' },
  { key: 'today',     label: 'Due Today',    color: '#f97316' },
  { key: 'tomorrow',  label: 'Due Tomorrow', color: '#eab308' },
  { key: 'thisWeek',  label: 'This Week',    color: '#22c55e' },
  { key: 'comingUp',  label: 'Coming Up',    color: '#3b82f6' },
  { key: 'noDueDate', label: 'No Due Date',  color: '#9ca3af' },
]

function BucketSection({ label, color, items }: { label: string; color: string; items: Assignment[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 14px 3px', gap: 6 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {label} · {items.length}
        </span>
      </div>
      {items.map(a => <AssignmentRow key={a.id} a={a} />)}
    </div>
  )
}

// ── Settings panel ───────────────────────────────────────────────────────────

const NOTIF_OPTIONS: { label: string; value: number }[] = [
  { label: '24 hours', value: 1440 },
  { label: '2 hours',  value: 120  },
  { label: '30 min',   value: 30   },
  { label: '15 min',   value: 15   },
]

function SettingsPanel({
  settings,
  courses,
  onSave,
  onClose,
}: {
  settings: Settings
  courses: Course[]
  onSave: (s: Partial<Settings>, c?: Course[]) => Promise<void>
  onClose: () => void
}) {
  const [baseUrl, setBaseUrl]   = useState(settings.canvasBaseUrl)
  const [icalUrl, setIcalUrl]   = useState(settings.canvasIcalUrl)
  const [interval, setInterval] = useState(settings.syncIntervalMinutes)
  const [leadTimes, setLeadTimes] = useState(new Set(settings.notificationLeadTimes))
  const [localCourses, setLocalCourses] = useState<Course[]>(courses)
  const [token, setToken]       = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    window.ipcRenderer.invoke('token:check').then((v: unknown) => setHasToken(v as boolean))
  }, [])

  // Reload courses whenever they change from a sync
  useEffect(() => { setLocalCourses(courses) }, [courses])

  function toggleLead(v: number) {
    setLeadTimes(prev => {
      const next = new Set(prev)
      next.has(v) ? next.delete(v) : next.add(v)
      return next
    })
  }

  function updateCourseColor(id: string, color: string) {
    setLocalCourses(prev => prev.map(c => c.id === id ? { ...c, color } : c))
  }

  function toggleCourseHidden(id: string) {
    setLocalCourses(prev => prev.map(c => c.id === id ? { ...c, hidden: !c.hidden } : c))
  }

  async function handleTestAndSave() {
    setTokenStatus('testing')
    setTokenError('')
    const valid = await window.ipcRenderer.invoke('token:validate', baseUrl.trim(), token.trim()) as boolean
    if (valid) {
      await window.ipcRenderer.invoke('token:save', token.trim())
      setTokenStatus('ok')
      setHasToken(true)
      setToken('')
    } else {
      setTokenStatus('error')
      setTokenError('Invalid token or wrong Canvas URL.')
    }
  }

  async function handleRemoveToken() {
    await window.ipcRenderer.invoke('token:delete')
    setHasToken(false)
    setTokenStatus('idle')
  }

  async function handleSave() {
    setSaving(true)
    await onSave(
      {
        canvasBaseUrl: baseUrl.trim() || 'https://canvas.uw.edu',
        canvasIcalUrl: icalUrl.trim(),
        syncIntervalMinutes: interval,
        notificationLeadTimes: [...leadTimes],
      },
      localCourses,
    )
    setSaving(false)
    onClose()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 12px' }}>
      {/* Canvas base URL */}
      <Section label="Canvas URL">
        <input
          type="url"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          style={fieldStyle}
          spellCheck={false}
          placeholder="https://canvas.uw.edu"
        />
      </Section>

      {/* REST API token */}
      <Section label="API Token">
        {hasToken ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#22c55e', flex: 1 }}>✓ Token saved in system keychain</span>
            <button onClick={handleRemoveToken} style={smallBtn('#ef4444')}>Remove</button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setTokenStatus('idle') }}
                style={{ ...fieldStyle, paddingRight: 48 }}
                placeholder="Paste token from Canvas"
                spellCheck={false}
              />
              <button
                onClick={() => setShowToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 10, color: '#9ca3af', cursor: 'pointer' }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            {tokenStatus === 'ok' && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 3 }}>✓ Token verified and saved</div>}
            {tokenStatus === 'error' && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{tokenError}</div>}
            <button
              onClick={handleTestAndSave}
              disabled={!token.trim() || tokenStatus === 'testing'}
              style={{ ...smallBtn('#3b82f6'), marginTop: 5, width: '100%' }}
            >
              {tokenStatus === 'testing' ? 'Verifying…' : 'Test & Save Token'}
            </button>
            <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
              Canvas › Account › Settings › Approved Integrations → New Access Token
            </div>
          </>
        )}
      </Section>

      {/* iCal feed fallback */}
      <Section label="iCal Feed URL (fallback if no token)">
        <input
          type="url"
          value={icalUrl}
          onChange={e => setIcalUrl(e.target.value)}
          style={fieldStyle}
          spellCheck={false}
          placeholder="https://canvas.uw.edu/feeds/calendars/user_….ics"
        />
        <div style={{ fontSize: 10, color: '#aaa', marginTop: 3 }}>
          Canvas › Calendar › Calendar Feed (bottom of page)
        </div>
      </Section>

      {/* Sync interval */}
      <Section label="Auto-Sync Interval">
        <select
          value={interval}
          onChange={e => setInterval(Number(e.target.value))}
          style={{ ...fieldStyle, appearance: 'auto' as never }}
        >
          {[15, 30, 60].map(v => (
            <option key={v} value={v}>{v} minutes</option>
          ))}
        </select>
      </Section>

      {/* Notification lead times */}
      <Section label="Notify Me Before Due Date">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {NOTIF_OPTIONS.map(({ label, value }) => (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#333', cursor: 'pointer', WebkitUserSelect: 'none' as never }}>
              <input
                type="checkbox"
                checked={leadTimes.has(value)}
                onChange={() => toggleLead(value)}
                style={{ accentColor: '#3b82f6' }}
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      {/* Course list */}
      {localCourses.length > 0 && (
        <Section label="Courses">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {localCourses.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Color swatch / picker */}
                <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: c.color, border: '1.5px solid rgba(0,0,0,0.12)', cursor: 'pointer' }} />
                  <input
                    type="color"
                    value={c.color}
                    onChange={e => updateCourseColor(c.id, e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    tabIndex={-1}
                  />
                </label>

                {/* Course name */}
                <span style={{
                  flex: 1, fontSize: 12, color: c.hidden ? '#bbb' : '#333',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {c.name}
                </span>

                {/* Visibility toggle */}
                <button
                  onClick={() => toggleCourseHidden(c.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: c.hidden ? '#d1d5db' : '#6b7280', padding: 0, lineHeight: 1 }}
                  title={c.hidden ? 'Show' : 'Hide'}
                >
                  {c.hidden ? '○' : '●'}
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
            Course colors apply on next sync
          </div>
        </Section>
      )}

      {/* Save / Cancel */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ flex: 1, ...smallBtn('#9ca3af') }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 2, ...smallBtn('#3b82f6') }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 7px',
  border: '1px solid #d1d5db',
  borderRadius: 5,
  outline: 'none',
  background: '#fff',
  color: '#111',
  boxSizing: 'border-box',
  WebkitUserSelect: 'text' as never,
}

function smallBtn(bg: string): React.CSSProperties {
  return {
    fontSize: 11, padding: '5px 10px',
    background: bg, color: '#fff',
    border: 'none', borderRadius: 5,
    cursor: 'pointer', fontWeight: 600,
  }
}

// ── Main Panel ───────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 120, 30],
  onboardingComplete: true,
}

export default function Panel() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [syncState, setSyncState]     = useState<SyncState>({ status: 'idle', lastSyncAt: null })
  const [settings, setSettings]       = useState<Settings>(SETTINGS_DEFAULTS)
  const [courses, setCourses]         = useState<Course[]>([])
  const [showSettings, setShowSettings] = useState(false)

  // Load initial state
  useEffect(() => {
    window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
    window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
    window.ipcRenderer.invoke('settings:get').then((s: unknown) => setSettings({ ...SETTINGS_DEFAULTS, ...(s as Settings) }))
    window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
  }, [])

  // Subscribe to push events
  useEffect(() => {
    const onData   = (_: unknown, d: Assignment[]) => setAssignments(d)
    const onStatus = (_: unknown, s: SyncState)    => setSyncState(s)
    const onCourses= (_: unknown, c: Course[])     => setCourses(c)
    const onShown  = () => {
      window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
      window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
      window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
    }

    window.ipcRenderer.on('assignments:data', onData)
    window.ipcRenderer.on('sync:status',      onStatus)
    window.ipcRenderer.on('courses:data',     onCourses)
    window.ipcRenderer.on('panel:shown',      onShown)

    return () => {
      window.ipcRenderer.off('assignments:data', onData)
      window.ipcRenderer.off('sync:status',      onStatus)
      window.ipcRenderer.off('courses:data',     onCourses)
      window.ipcRenderer.off('panel:shown',      onShown)
    }
  }, [])

  const triggerSync = useCallback(() => {
    window.ipcRenderer.send('sync:trigger')
  }, [])

  const saveSettings = useCallback(async (patch: Partial<Settings>, updatedCourses?: Course[]) => {
    const updated = await window.ipcRenderer.invoke('settings:set', patch) as Settings
    setSettings({ ...SETTINGS_DEFAULTS, ...updated })
    if (updatedCourses) {
      const saved = await window.ipcRenderer.invoke('courses:save', updatedCourses) as Course[]
      setCourses(saved)
    }
  }, [])

  const hiddenCourseIds = new Set(courses.filter(c => c.hidden).map(c => c.id))
  const bucketed = bucketAssignments(assignments, hiddenCourseIds)
  const overdueCount = bucketed.overdue.length
  const todayCount   = bucketed.today.length
  const badgeCount   = overdueCount + todayCount
  const totalCount   = Object.values(bucketed).reduce((s, arr) => s + arr.length, 0)

  const syncColor =
    syncState.status === 'syncing' ? '#3b82f6'
    : syncState.status === 'error' ? '#ef4444'
    : 'transparent'

  return (
    <div style={{
      width: '100%', height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: 'rgba(249,249,249,0.96)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, sans-serif',
      WebkitUserSelect: 'none', userSelect: 'none',
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
          {showSettings ? 'Settings' : 'Canvas Dashboard'}
        </span>

        {!showSettings && badgeCount > 0 && (
          <span style={{
            marginLeft: 7,
            background: overdueCount > 0 ? '#ef4444' : '#f97316',
            color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
            padding: '1px 6px', lineHeight: 1.4,
          }}>
            {badgeCount}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {!showSettings && syncState.status !== 'idle' && (
            <span style={{ fontSize: 11, color: syncColor }}>
              {syncState.status === 'syncing' ? '↻' : '⚠'}
            </span>
          )}
          <button
            onClick={() => setShowSettings(v => !v)}
            title={showSettings ? 'Close settings' : 'Settings'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 15, color: showSettings ? '#3b82f6' : '#aaa',
              padding: 0, lineHeight: 1,
            }}
          >
            {showSettings ? '✕' : '⚙'}
          </button>
        </div>
      </div>

      {/* ── Body: settings view or assignment list ── */}
      {showSettings ? (
        <SettingsPanel
          settings={settings}
          courses={courses}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {totalCount === 0 ? (
              <div style={{ padding: '28px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
                <div style={{ fontSize: 13, color: '#555', fontWeight: 500 }}>All clear!</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                  {syncState.status === 'error'
                    ? `Sync error: ${syncState.error ?? 'unknown'}`
                    : 'No upcoming assignments found.'}
                </div>
              </div>
            ) : (
              BUCKET_META.map(({ key, label, color }) => (
                <BucketSection key={key} label={label} color={color} items={bucketed[key]} />
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
                background: 'none', border: '1px solid #e5e7eb',
                borderRadius: 5, cursor: syncState.status === 'syncing' ? 'default' : 'pointer',
                color: '#555', fontWeight: 500,
                opacity: syncState.status === 'syncing' ? 0.5 : 1,
              }}
            >
              {syncState.status === 'syncing' ? 'Syncing…' : '↻ Refresh'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
