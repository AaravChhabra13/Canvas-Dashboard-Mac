import { useState, useEffect, useCallback, useContext, createContext } from 'react'
import type { CSSProperties } from 'react'
import type { Assignment, BucketedAssignments, Course, PersonalTask, Settings, SyncState } from '../shared/types'

// ── Theme ─────────────────────────────────────────────────────────────────────

interface Theme {
  bg: string
  text: string
  textMuted: string
  textFaint: string
  border: string
  hover: string
  inputBg: string
  inputBorder: string
  inputColor: string
  sectionLabel: string
  checkboxAccent: string
}

const LIGHT: Theme = {
  bg: 'rgba(250,250,250,0.93)',
  text: '#1a1a1a',
  textMuted: '#777',
  textFaint: '#bbb',
  border: 'rgba(0,0,0,0.08)',
  hover: 'rgba(0,0,0,0.055)',
  inputBg: '#fff',
  inputBorder: '#d1d5db',
  inputColor: '#111',
  sectionLabel: '#9ca3af',
  checkboxAccent: '#3b82f6',
}

const DARK: Theme = {
  bg: 'rgba(22,22,26,0.93)',
  text: '#f0f0f0',
  textMuted: '#999',
  textFaint: '#555',
  border: 'rgba(255,255,255,0.1)',
  hover: 'rgba(255,255,255,0.07)',
  inputBg: 'rgba(55,55,62,0.95)',
  inputBorder: 'rgba(255,255,255,0.15)',
  inputColor: '#f0f0f0',
  sectionLabel: '#666',
  checkboxAccent: '#3b82f6',
}

const ThemeCtx = createContext<Theme>(LIGHT)
const useTheme = () => useContext(ThemeCtx)

function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setScheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return scheme
}

// ── Personal task helpers ─────────────────────────────────────────────────────

function personalToAssignment(t: PersonalTask): Assignment {
  const now = new Date()
  return {
    id: t.id,
    title: t.title,
    courseId: '__personal__',
    courseName: 'Personal',
    courseColor: '#8b5cf6',
    dueAt: t.dueAt,
    type: 'assignment',
    submissionState: 'unknown',
    pointsPossible: null,
    canvasUrl: '',
    isOverdue: t.dueAt !== null && new Date(t.dueAt) < now,
    source: 'manual',
  }
}

// ── Bucketing ─────────────────────────────────────────────────────────────────

function bucketAssignments(list: Assignment[]): BucketedAssignments {
  const now = new Date()
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const tomorrowStart = new Date(now); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0)
  const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999)
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7); weekEnd.setHours(23, 59, 59, 999)

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

// ── Formatting ────────────────────────────────────────────────────────────────

function formatDue(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `Today ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time
}

function formatLastSync(iso: string | null): string {
  if (!iso) return 'Never synced'
  return `Updated ${new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

// ── Shared style helpers ──────────────────────────────────────────────────────

function fieldStyle(theme: Theme, extra?: CSSProperties): CSSProperties {
  return {
    width: '100%', fontSize: 12, padding: '5px 7px',
    border: `1px solid ${theme.inputBorder}`, borderRadius: 5,
    outline: 'none', background: theme.inputBg, color: theme.inputColor,
    boxSizing: 'border-box', WebkitUserSelect: 'text' as never,
    ...extra,
  }
}

function smallBtn(bg: string, extra?: CSSProperties): CSSProperties {
  return {
    fontSize: 11, padding: '5px 10px',
    background: bg, color: '#fff',
    border: 'none', borderRadius: 5,
    cursor: 'pointer', fontWeight: 600,
    ...extra,
  }
}

// ── Submission badge ──────────────────────────────────────────────────────────

function SubmissionBadge({ state }: { state: Assignment['submissionState'] }) {
  if (state === 'submitted') return <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }} title="Submitted">✓</span>
  if (state === 'graded') return <span style={{ fontSize: 11, color: '#3b82f6', flexShrink: 0 }} title="Graded">★</span>
  return null
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({
  a, onComplete, onDelete,
}: {
  a: Assignment
  onComplete: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', padding: '5px 14px', gap: 8,
        background: hovered ? theme.hover : 'transparent', transition: 'background 0.1s',
        borderLeft: a.source === 'manual' ? `2px solid ${a.courseColor}` : '2px solid transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Color indicator */}
      {a.source === 'manual'
        ? <span style={{ fontSize: 11, color: a.courseColor, flexShrink: 0, lineHeight: 1 }}>✎</span>
        : <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.courseColor, flexShrink: 0 }} />
      }

      {/* Title */}
      <span
        onClick={() => a.canvasUrl && window.ipcRenderer.send('open-external', a.canvasUrl)}
        style={{
          flex: 1, fontSize: 13, color: theme.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          cursor: a.canvasUrl ? 'pointer' : 'default',
        }}
      >
        {a.title}
      </span>

      {/* Due time — hide on hover to make room for actions */}
      {a.dueAt && !hovered && (
        <span style={{ fontSize: 11, color: theme.textMuted, flexShrink: 0 }}>
          {formatDue(a.dueAt)}
        </span>
      )}

      {!hovered && <SubmissionBadge state={a.submissionState} />}

      {/* Action buttons on hover */}
      {hovered && (
        <>
          {a.source === 'manual' && onDelete && (
            <button
              onClick={e => { e.stopPropagation(); onDelete(a.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
              title="Delete task"
            >✕</button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onComplete(a.id) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#22c55e', padding: '0 2px', flexShrink: 0, lineHeight: 1, fontWeight: 600 }}
            title="Mark as done"
          >✓</button>
        </>
      )}
    </div>
  )
}

// ── Completed section ─────────────────────────────────────────────────────────

function CompletedRow({ a, onUnmark }: { a: Assignment; onUnmark: (id: string) => void }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', padding: '4px 14px', gap: 8, opacity: 0.55,
        background: hovered ? theme.hover : 'transparent', transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.courseColor, flexShrink: 0 }} />
      <span style={{
        flex: 1, fontSize: 12, color: theme.textMuted,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through',
      }}>
        {a.title}
      </span>
      {hovered && (
        <button
          onClick={() => onUnmark(a.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: theme.textMuted, padding: '0 2px', flexShrink: 0 }}
          title="Unmark done"
        >↩</button>
      )}
    </div>
  )
}

function CompletedSection({ items, onUnmark }: { items: Assignment[]; onUnmark: (id: string) => void }) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div style={{ marginTop: 6, borderTop: `1px solid ${theme.border}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', width: '100%',
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px 3px',
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#9ca3af' }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: theme.sectionLabel, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Completed · {items.length}
        </span>
        <span style={{ fontSize: 10, color: theme.sectionLabel, marginLeft: 'auto' }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && items.map(a => <CompletedRow key={a.id} a={a} onUnmark={onUnmark} />)}
    </div>
  )
}

// ── Bucket section ────────────────────────────────────────────────────────────

const BUCKET_META: Array<{ key: keyof BucketedAssignments; label: string; color: string }> = [
  { key: 'overdue',   label: 'Overdue',      color: '#ef4444' },
  { key: 'today',     label: 'Due Today',    color: '#f97316' },
  { key: 'tomorrow',  label: 'Due Tomorrow', color: '#eab308' },
  { key: 'thisWeek',  label: 'This Week',    color: '#22c55e' },
  { key: 'comingUp',  label: 'Coming Up',    color: '#3b82f6' },
  { key: 'noDueDate', label: 'No Due Date',  color: '#9ca3af' },
]

function SectionHeader({ label, color, count }: { label: string; color: string; count: number }) {
  const theme = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '5px 14px 3px', gap: 6 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: theme.sectionLabel, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label} · {count}
      </span>
    </div>
  )
}

// ── Course filter tabs ────────────────────────────────────────────────────────

function CourseTab({ label, color, active, onClick }: { label: string; color: string; active: boolean; onClick: () => void }) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0, padding: '3px 9px', fontSize: 11,
        fontWeight: active ? 600 : 400,
        background: active ? `${color}22` : hovered ? theme.hover : 'transparent',
        color: active ? color : theme.textMuted,
        border: active ? `1px solid ${color}55` : '1px solid transparent',
        borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
        maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis',
        transition: 'background 0.1s',
      }}
    >
      {label}
    </button>
  )
}

function CourseFilterTabs({
  courses, activeFilter, onSelect,
}: {
  courses: Course[]
  activeFilter: string | null
  onSelect: (id: string | null) => void
}) {
  const theme = useTheme()
  const visible = courses.filter(c => !c.hidden)
  if (visible.length === 0) return null
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', gap: 4,
      padding: '5px 14px 5px', flexShrink: 0,
      borderBottom: `1px solid ${theme.border}`,
      // hide scrollbar but keep scroll
      scrollbarWidth: 'none',
    }}>
      <CourseTab label="All" color="#888" active={activeFilter === null} onClick={() => onSelect(null)} />
      {visible.map(c => (
        <CourseTab key={c.id} label={c.name} color={c.color} active={activeFilter === c.id} onClick={() => onSelect(c.id)} />
      ))}
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ onAdd, onCancel }: { onAdd: (title: string, dueAt: string) => void; onCancel: () => void }) {
  const theme = useTheme()
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')

  const submit = () => { if (title.trim()) onAdd(title.trim(), dueAt) }

  return (
    <div style={{ padding: '8px 14px 10px', borderBottom: `1px solid ${theme.border}`, background: theme.hover }}>
      <input
        autoFocus
        type="text"
        placeholder="Task title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        style={{ ...fieldStyle(theme), marginBottom: 5 }}
      />
      <input
        type="datetime-local"
        value={dueAt}
        onChange={e => setDueAt(e.target.value)}
        style={fieldStyle(theme, { colorScheme: (theme === DARK ? 'dark' : 'light') as never })}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, ...smallBtn('#9ca3af') }}>Cancel</button>
        <button onClick={submit} disabled={!title.trim()} style={{ flex: 2, ...smallBtn(title.trim() ? '#3b82f6' : '#93c5fd') }}>
          Add Task
        </button>
      </div>
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────

const NOTIF_OPTIONS = [
  { label: '24 hours', value: 1440 },
  { label: '2 hours',  value: 120  },
  { label: '30 min',   value: 30   },
  { label: '15 min',   value: 15   },
]

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: theme.sectionLabel, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function SettingsPanel({
  settings, courses, onSave, onClose,
}: {
  settings: Settings
  courses: Course[]
  onSave: (s: Partial<Settings>, c?: Course[]) => Promise<void>
  onClose: () => void
}) {
  const theme = useTheme()
  const [baseUrl, setBaseUrl]     = useState(settings.canvasBaseUrl)
  const [icalUrl, setIcalUrl]     = useState(settings.canvasIcalUrl)
  const [cookie, setCookie]       = useState(settings.canvasSessionCookie)
  const [showCookie, setShowCookie] = useState(false)
  const [interval, setInterval]   = useState(settings.syncIntervalMinutes)
  const [leadTimes, setLeadTimes] = useState(new Set(settings.notificationLeadTimes))
  const [localCourses, setLocalCourses] = useState<Course[]>(courses)
  const [token, setToken]         = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  const [hasExistingToken, setHasExistingToken] = useState(false)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    window.ipcRenderer.invoke('token:check').then((v: unknown) => setHasExistingToken(v as boolean))
  }, [])
  useEffect(() => { setLocalCourses(courses) }, [courses])

  const toggleLead = (v: number) => setLeadTimes(prev => {
    const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next
  })

  async function handleTestAndSave() {
    setTokenStatus('testing'); setTokenError('')
    const valid = await window.ipcRenderer.invoke('token:validate', baseUrl.trim(), token.trim()) as boolean
    if (valid) {
      await window.ipcRenderer.invoke('token:save', token.trim())
      setTokenStatus('ok'); setHasExistingToken(true); setToken('')
    } else {
      setTokenStatus('error'); setTokenError('Invalid token or wrong Canvas URL.')
    }
  }

  async function handleRemoveToken() {
    await window.ipcRenderer.invoke('token:delete')
    setHasExistingToken(false); setTokenStatus('idle')
  }

  async function handleSave() {
    setSaving(true)
    await onSave(
      {
        canvasBaseUrl: baseUrl.trim() || 'https://canvas.uw.edu',
        canvasIcalUrl: icalUrl.trim(),
        canvasSessionCookie: cookie.trim(),
        syncIntervalMinutes: interval,
        notificationLeadTimes: [...leadTimes],
      },
      localCourses,
    )
    setSaving(false)
    onClose()
  }

  const fs = (extra?: CSSProperties) => fieldStyle(theme, extra)
  const sb = (bg: string) => smallBtn(bg)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 12px' }}>

      <Section label="Canvas URL">
        <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
          style={fs()} spellCheck={false} placeholder="https://canvas.uw.edu" />
      </Section>

      <Section label="API Token">
        {hasExistingToken ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#22c55e', flex: 1 }}>✓ Token saved in system keychain</span>
            <button onClick={handleRemoveToken} style={sb('#ef4444')}>Remove</button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'} value={token}
                onChange={e => { setToken(e.target.value); setTokenStatus('idle') }}
                style={fs({ paddingRight: 48 })} placeholder="Paste token from Canvas" spellCheck={false}
              />
              <button onClick={() => setShowToken(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 10, color: theme.sectionLabel, cursor: 'pointer' }}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            {tokenStatus === 'ok'    && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 3 }}>✓ Verified and saved</div>}
            {tokenStatus === 'error' && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>{tokenError}</div>}
            <button onClick={handleTestAndSave} disabled={!token.trim() || tokenStatus === 'testing'}
              style={{ ...sb('#3b82f6'), marginTop: 5, width: '100%' }}>
              {tokenStatus === 'testing' ? 'Verifying…' : 'Test & Save Token'}
            </button>
          </>
        )}
      </Section>

      <Section label="Session Cookie (Canvas GraphQL)">
        <div style={{ position: 'relative' }}>
          <input
            type={showCookie ? 'text' : 'password'} value={cookie}
            onChange={e => setCookie(e.target.value)}
            style={fs({ paddingRight: 48 })} placeholder="Paste Cookie header value" spellCheck={false}
          />
          <button onClick={() => setShowCookie(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 10, color: theme.sectionLabel, cursor: 'pointer' }}>
            {showCookie ? 'Hide' : 'Show'}
          </button>
        </div>
        <div style={{ fontSize: 10, color: theme.sectionLabel, marginTop: 3 }}>
          DevTools → Network → any Canvas request → Request Headers → Cookie
        </div>
      </Section>

      <Section label="iCal Feed URL">
        <input type="url" value={icalUrl} onChange={e => setIcalUrl(e.target.value)}
          style={fs()} spellCheck={false} placeholder="https://canvas.uw.edu/feeds/calendars/user_….ics" />
        <div style={{ fontSize: 10, color: theme.sectionLabel, marginTop: 3 }}>
          Canvas → Calendar → Calendar Feed (bottom of page)
        </div>
      </Section>

      <Section label="Auto-Sync Interval">
        <select value={interval} onChange={e => setInterval(Number(e.target.value))}
          style={{ ...fs(), appearance: 'auto' as never }}>
          {[15, 30, 60].map(v => <option key={v} value={v}>{v} minutes</option>)}
        </select>
      </Section>

      <Section label="Notify Me Before Due Date">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {NOTIF_OPTIONS.map(({ label, value }) => (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: theme.text, cursor: 'pointer', WebkitUserSelect: 'none' as never }}>
              <input type="checkbox" checked={leadTimes.has(value)} onChange={() => toggleLead(value)}
                style={{ accentColor: theme.checkboxAccent }} />
              {label}
            </label>
          ))}
        </div>
      </Section>

      {localCourses.length > 0 && (
        <Section label="Courses">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {localCourses.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: c.color, border: `1.5px solid ${theme.border}`, cursor: 'pointer' }} />
                  <input type="color" value={c.color}
                    onChange={e => setLocalCourses(prev => prev.map(x => x.id === c.id ? { ...x, color: e.target.value } : x))}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} tabIndex={-1} />
                </label>
                <span style={{ flex: 1, fontSize: 12, color: c.hidden ? theme.textFaint : theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                <button
                  onClick={() => setLocalCourses(prev => prev.map(x => x.id === c.id ? { ...x, hidden: !x.hidden } : x))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: c.hidden ? theme.textFaint : theme.textMuted, padding: 0, lineHeight: 1 }}
                  title={c.hidden ? 'Show' : 'Hide'}
                >
                  {c.hidden ? '○' : '●'}
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: theme.sectionLabel, marginTop: 6 }}>Course colors apply on next sync</div>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onClose} style={{ flex: 1, ...sb('#9ca3af') }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 2, ...sb('#3b82f6') }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: Settings = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  canvasSessionCookie: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 120, 30],
  onboardingComplete: true,
}

export default function Panel() {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? DARK : LIGHT

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [syncState, setSyncState]     = useState<SyncState>({ status: 'idle', lastSyncAt: null })
  const [settings, setSettings]       = useState<Settings>(SETTINGS_DEFAULTS)
  const [courses, setCourses]         = useState<Course[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [showAddTask, setShowAddTask]   = useState(false)
  const [showOldOverdue, setShowOldOverdue] = useState(false)

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
    window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
    window.ipcRenderer.invoke('settings:get').then((s: unknown) => setSettings({ ...SETTINGS_DEFAULTS, ...(s as Settings) }))
    window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
    window.ipcRenderer.invoke('completed:get').then((ids: unknown) => setCompletedIds(new Set(ids as string[])))
    window.ipcRenderer.invoke('tasks:get').then((t: unknown) => setPersonalTasks(t as PersonalTask[]))
  }, [])

  // ── Push subscriptions ─────────────────────────────────────────────────────
  useEffect(() => {
    const onData    = (_: unknown, d: Assignment[]) => setAssignments(d)
    const onStatus  = (_: unknown, s: SyncState)    => setSyncState(s)
    const onCourses = (_: unknown, c: Course[])     => setCourses(c)
    const onShown   = () => {
      window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
      window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
      window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
      window.ipcRenderer.invoke('completed:get').then((ids: unknown) => setCompletedIds(new Set(ids as string[])))
      window.ipcRenderer.invoke('tasks:get').then((t: unknown) => setPersonalTasks(t as PersonalTask[]))
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

  // ── Actions ────────────────────────────────────────────────────────────────
  const triggerSync = useCallback(() => window.ipcRenderer.send('sync:trigger'), [])

  const saveSettings = useCallback(async (patch: Partial<Settings>, updatedCourses?: Course[]) => {
    const updated = await window.ipcRenderer.invoke('settings:set', patch) as Settings
    setSettings({ ...SETTINGS_DEFAULTS, ...updated })
    if (updatedCourses) {
      const saved = await window.ipcRenderer.invoke('courses:save', updatedCourses) as Course[]
      setCourses(saved)
    }
  }, [])

  const handleToggleComplete = useCallback(async (id: string) => {
    const updated = await window.ipcRenderer.invoke('completed:toggle', id) as string[]
    setCompletedIds(new Set(updated))
  }, [])

  const handleAddTask = useCallback(async (title: string, dueAtLocal: string) => {
    const newTask: PersonalTask = {
      id: `personal-${Date.now()}`,
      title,
      dueAt: dueAtLocal ? new Date(dueAtLocal).toISOString() : null,
      createdAt: new Date().toISOString(),
    }
    const saved = await window.ipcRenderer.invoke('tasks:save', [...personalTasks, newTask]) as PersonalTask[]
    setPersonalTasks(saved)
    setShowAddTask(false)
  }, [personalTasks])

  const handleDeleteTask = useCallback(async (id: string) => {
    const updated = personalTasks.filter(t => t.id !== id)
    const saved = await window.ipcRenderer.invoke('tasks:save', updated) as PersonalTask[]
    setPersonalTasks(saved)
    if (completedIds.has(id)) {
      const updatedIds = await window.ipcRenderer.invoke('completed:toggle', id) as string[]
      setCompletedIds(new Set(updatedIds))
    }
  }, [personalTasks, completedIds])

  // ── Derived data ───────────────────────────────────────────────────────────
  const personalAssignments = personalTasks.map(personalToAssignment)
  const hiddenCourseIds = new Set(courses.filter(c => c.hidden).map(c => c.id))

  const allVisible = [...assignments, ...personalAssignments].filter(a =>
    !hiddenCourseIds.has(a.courseId) && !completedIds.has(a.id) &&
    (activeFilter === null || a.courseId === activeFilter),
  )

  const bucketed = bucketAssignments(allVisible)

  // Split overdue into recent (≤3 days past) and old (>3 days past)
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  const recentOverdue = bucketed.overdue.filter(a => !a.dueAt || new Date(a.dueAt) >= threeDaysAgo)
  const oldOverdue    = bucketed.overdue.filter(a => a.dueAt && new Date(a.dueAt) < threeDaysAgo)

  const completedList = [...assignments, ...personalAssignments].filter(a => completedIds.has(a.id))

  const overdueCount = bucketed.overdue.length
  const todayCount   = bucketed.today.length
  const badgeCount   = overdueCount + todayCount
  const totalCount   = Object.values(bucketed).reduce((s, arr) => s + arr.length, 0)

  const syncColor = syncState.status === 'syncing' ? '#3b82f6' : syncState.status === 'error' ? '#ef4444' : 'transparent'

  const rowProps = { onComplete: handleToggleComplete }
  const personalRowProps = { ...rowProps, onDelete: handleDeleteTask }

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{
        width: '100%', height: '100vh',
        display: 'flex', flexDirection: 'column',
        background: theme.bg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, sans-serif',
        WebkitUserSelect: 'none', userSelect: 'none',
        overflow: 'hidden', borderRadius: 12,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '11px 14px 9px',
          borderBottom: showSettings || courses.length === 0 ? `1px solid ${theme.border}` : 'none',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, letterSpacing: -0.2 }}>
            {showSettings ? 'Settings' : 'Canvas Dashboard'}
          </span>

          {!showSettings && badgeCount > 0 && (
            <span style={{
              marginLeft: 7, background: overdueCount > 0 ? '#ef4444' : '#f97316',
              color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', lineHeight: 1.4,
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: showSettings ? '#3b82f6' : theme.textFaint, padding: 0, lineHeight: 1 }}
            >
              {showSettings ? '✕' : '⚙'}
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        {showSettings ? (
          <SettingsPanel settings={settings} courses={courses} onSave={saveSettings} onClose={() => setShowSettings(false)} />
        ) : (
          <>
            {/* Course filter tabs */}
            {!showAddTask && (
              <CourseFilterTabs courses={courses} activeFilter={activeFilter} onSelect={setActiveFilter} />
            )}

            {/* Add task form */}
            {showAddTask && <AddTaskForm onAdd={handleAddTask} onCancel={() => setShowAddTask(false)} />}

            {/* Assignment list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {totalCount === 0 && completedList.length === 0 ? (
                <div style={{ padding: '28px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>🎉</div>
                  <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>All clear!</div>
                  <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                    {syncState.status === 'error'
                      ? `Sync error: ${syncState.error ?? 'unknown'}`
                      : 'No upcoming assignments found.'}
                  </div>
                </div>
              ) : (
                <>
                  {/* Overdue bucket — with old-overdue collapse */}
                  {(recentOverdue.length > 0 || oldOverdue.length > 0) && (
                    <div style={{ marginBottom: 4 }}>
                      <SectionHeader label="Overdue" color="#ef4444" count={bucketed.overdue.length} />
                      {recentOverdue.map(a => (
                        <AssignmentRow key={a.id} a={a} {...(a.source === 'manual' ? personalRowProps : rowProps)} />
                      ))}
                      {oldOverdue.length > 0 && !showOldOverdue && (
                        <button
                          onClick={() => setShowOldOverdue(true)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: theme.textMuted, padding: '3px 14px', textAlign: 'left', width: '100%' }}
                        >
                          + {oldOverdue.length} older item{oldOverdue.length !== 1 ? 's' : ''}…
                        </button>
                      )}
                      {showOldOverdue && oldOverdue.map(a => (
                        <AssignmentRow key={a.id} a={a} {...(a.source === 'manual' ? personalRowProps : rowProps)} />
                      ))}
                      {showOldOverdue && oldOverdue.length > 0 && (
                        <button
                          onClick={() => setShowOldOverdue(false)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: theme.textMuted, padding: '3px 14px', textAlign: 'left', width: '100%' }}
                        >
                          Hide older items
                        </button>
                      )}
                    </div>
                  )}

                  {/* Other buckets */}
                  {BUCKET_META.filter(m => m.key !== 'overdue').map(({ key, label, color }) => {
                    const items = bucketed[key]
                    if (items.length === 0) return null
                    return (
                      <div key={key} style={{ marginBottom: 4 }}>
                        <SectionHeader label={label} color={color} count={items.length} />
                        {items.map(a => (
                          <AssignmentRow key={a.id} a={a} {...(a.source === 'manual' ? personalRowProps : rowProps)} />
                        ))}
                      </div>
                    )
                  })}

                  <CompletedSection items={completedList} onUnmark={handleToggleComplete} />
                </>
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{
              borderTop: `1px solid ${theme.border}`,
              padding: '7px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: theme.textFaint }}>
                {formatLastSync(syncState.lastSyncAt)}
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  onClick={() => setShowAddTask(v => !v)}
                  title="Add personal task"
                  style={{
                    fontSize: 15, padding: '2px 7px',
                    background: 'none', border: `1px solid ${theme.border}`,
                    borderRadius: 5, cursor: 'pointer', color: showAddTask ? '#3b82f6' : theme.textMuted, fontWeight: 600,
                  }}
                >+</button>
                <button
                  onClick={triggerSync}
                  disabled={syncState.status === 'syncing'}
                  style={{
                    fontSize: 11, padding: '3px 9px',
                    background: 'none', border: `1px solid ${theme.border}`,
                    borderRadius: 5, cursor: syncState.status === 'syncing' ? 'default' : 'pointer',
                    color: theme.textMuted, fontWeight: 500,
                    opacity: syncState.status === 'syncing' ? 0.5 : 1,
                  }}
                >
                  {syncState.status === 'syncing' ? 'Syncing…' : '↻ Refresh'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </ThemeCtx.Provider>
  )
}
