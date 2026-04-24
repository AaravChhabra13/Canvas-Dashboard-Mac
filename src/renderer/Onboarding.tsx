import { useState, CSSProperties } from 'react'

type Step = 1 | 2 | 3 | 4 | 5

// ── Shared styles ────────────────────────────────────────────────────────────

const root: CSSProperties = {
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'rgba(249,249,249,0.97)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, sans-serif',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  overflow: 'hidden',
}

// Title bar acts as drag handle so the frameless window is movable
const titleBar = {
  height: 28,
  flexShrink: 0,
  WebkitAppRegion: 'drag',
  background: 'transparent',
} as CSSProperties

const body: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 40px 32px',
  gap: 0,
}

const heading: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: '#111',
  marginBottom: 8,
  textAlign: 'center',
}

const subtext: CSSProperties = {
  fontSize: 13,
  color: '#666',
  textAlign: 'center',
  lineHeight: 1.5,
  marginBottom: 24,
}

function inputStyle(extra?: CSSProperties): CSSProperties {
  return {
    width: '100%',
    fontSize: 13,
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    outline: 'none',
    background: '#fff',
    color: '#111',
    boxSizing: 'border-box',
    WebkitUserSelect: 'text' as never,
    ...extra,
  }
}

function btnPrimary(disabled = false): CSSProperties {
  return {
    width: '100%',
    padding: '9px 0',
    fontSize: 13,
    fontWeight: 600,
    background: disabled ? '#93c5fd' : '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    cursor: disabled ? 'default' : 'pointer',
    marginTop: 10,
  }
}

function btnSecondary(): CSSProperties {
  return {
    background: 'none',
    border: 'none',
    fontSize: 12,
    color: '#9ca3af',
    cursor: 'pointer',
    marginTop: 8,
    padding: '4px 0',
  }
}

// Progress dots at top of each step
function Dots({ step }: { step: Step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
      {([1, 2, 3, 4, 5] as Step[]).map(s => (
        <div
          key={s}
          style={{
            width: s === step ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: s === step ? '#3b82f6' : s < step ? '#bfdbfe' : '#e5e7eb',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const [step, setStep] = useState<Step>(1)
  const [baseUrl, setBaseUrl] = useState('https://canvas.uw.edu')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  const [notifDone, setNotifDone] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncCount, setSyncCount] = useState<number | null>(null)
  const [syncError, setSyncError] = useState('')

  // ── Step handlers ────────────────────────────────────────────────────────

  async function goStep2() {
    await window.ipcRenderer.invoke('settings:set', {
      canvasBaseUrl: baseUrl.trim() || 'https://canvas.uw.edu',
    })
    setStep(3)
  }

  async function goStep3() {
    setStep(4)
  }

  async function handleTestAndSave() {
    setTokenStatus('testing')
    setTokenError('')
    const url = baseUrl.trim() || 'https://canvas.uw.edu'
    const valid = await window.ipcRenderer.invoke('token:validate', url, token.trim()) as boolean
    if (valid) {
      await window.ipcRenderer.invoke('token:save', token.trim())
      setTokenStatus('ok')
    } else {
      setTokenStatus('error')
      setTokenError('Invalid token or wrong Canvas URL — check both and try again.')
    }
  }

  async function handleEnableNotifications() {
    await window.ipcRenderer.invoke('notifications:request')
    setNotifDone(true)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    const result = await window.ipcRenderer.invoke('sync:run-and-wait') as {
      count: number
      error?: string
    }
    setSyncing(false)
    if (result.error) {
      setSyncError(result.error)
    } else {
      setSyncCount(result.count)
    }
  }

  async function handleFinish() {
    await window.ipcRenderer.invoke('onboarding:complete')
    // Main process closes this window and shows the panel
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={root}>
      <div style={titleBar} />

      <div style={body}>
        <Dots step={step} />

        {step === 1 && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
            <div style={heading}>Canvas Dashboard</div>
            <div style={subtext}>
              Your Canvas assignments, always one click away.<br />
              Setup takes less than a minute.
            </div>
            <button style={btnPrimary()} onClick={() => setStep(2)}>
              Get Started
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={heading}>Canvas URL</div>
            <div style={subtext}>
              Your school's Canvas address. UW students can leave this as-is.
            </div>
            <input
              style={inputStyle()}
              type="url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && goStep2()}
              placeholder="https://canvas.uw.edu"
              spellCheck={false}
            />
            <button style={btnPrimary(!baseUrl.trim())} onClick={goStep2} disabled={!baseUrl.trim()}>
              Continue
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <div style={heading}>Connect to Canvas</div>
            <div style={subtext}>
              Generate a Personal Access Token in Canvas:<br />
              <span
                style={{ color: '#3b82f6', cursor: 'pointer' }}
                onClick={() =>
                  window.ipcRenderer.send(
                    'open-external',
                    `${baseUrl.trim()}/profile/settings#access_tokens`,
                  )
                }
              >
                Account › Settings › Approved Integrations
              </span>
              {' '}→ New Access Token
            </div>

            <div style={{ width: '100%', position: 'relative' }}>
              <input
                style={inputStyle({ paddingRight: 60 })}
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setTokenStatus('idle') }}
                placeholder="Paste your token here"
                spellCheck={false}
              />
              <button
                onClick={() => setShowToken(v => !v)}
                style={{
                  position: 'absolute', right: 8, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: '#9ca3af',
                  WebkitUserSelect: 'none' as never,
                }}
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>

            {tokenStatus === 'ok' && (
              <div style={{ fontSize: 12, color: '#22c55e', marginTop: 6, textAlign: 'center' }}>
                ✓ Token verified and saved
              </div>
            )}
            {tokenStatus === 'error' && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6, textAlign: 'center' }}>
                {tokenError}
              </div>
            )}

            {tokenStatus !== 'ok' ? (
              <button
                style={btnPrimary(!token.trim() || tokenStatus === 'testing')}
                onClick={handleTestAndSave}
                disabled={!token.trim() || tokenStatus === 'testing'}
              >
                {tokenStatus === 'testing' ? 'Verifying…' : 'Test & Save Token'}
              </button>
            ) : (
              <button style={btnPrimary()} onClick={goStep3}>
                Continue
              </button>
            )}

            <button style={btnSecondary()} onClick={() => setStep(4)}>
              Skip — use iCal feed instead
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔔</div>
            <div style={heading}>Notifications</div>
            <div style={subtext}>
              Get notified before assignments are due (24 h, 2 h, and 30 min by default).<br />
              You can change lead times in settings later.
            </div>

            {notifDone ? (
              <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 10, textAlign: 'center' }}>
                ✓ Notifications enabled
              </div>
            ) : (
              <button style={btnPrimary()} onClick={handleEnableNotifications}>
                Enable Notifications
              </button>
            )}

            <button style={btnPrimary()} onClick={() => { handleSync(); setStep(5) }}>
              {notifDone ? 'Continue' : 'Skip for Now'}
            </button>
          </>
        )}

        {step === 5 && (
          <>
            {syncing && !syncCount && !syncError && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div style={heading}>Syncing Canvas…</div>
                <div style={subtext}>Fetching your assignments for the first time.</div>
              </>
            )}
            {!syncing && syncCount !== null && (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
                <div style={heading}>
                  {syncCount === 0 ? 'All clear!' : `Found ${syncCount} assignment${syncCount !== 1 ? 's' : ''}!`}
                </div>
                <div style={subtext}>
                  {syncCount === 0
                    ? 'No upcoming assignments right now.'
                    : 'Your dashboard is ready. Click the menu bar icon anytime to check in.'}
                </div>
                <button style={btnPrimary()} onClick={handleFinish}>
                  Open Dashboard
                </button>
              </>
            )}
            {!syncing && syncError && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <div style={heading}>Sync failed</div>
                <div style={{ ...subtext, color: '#ef4444' }}>{syncError}</div>
                <button style={btnPrimary()} onClick={handleFinish}>
                  Open Dashboard Anyway
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
