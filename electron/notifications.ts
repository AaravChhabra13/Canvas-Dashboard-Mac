import { Notification, shell } from 'electron'
import type { Assignment } from '../src/shared/types'

// Tracks which (assignment, leadTime) pairs have already fired this session.
// This is in-memory only — resets on restart. That's intentional: the window
// between lastSyncAt and now acts as the durable dedup guard across restarts.
const fired = new Set<string>()

export function checkAndFireNotifications(
  assignments: Assignment[],
  leadTimes: number[],
  lastSyncAt: string | null,
): void {
  if (!Notification.isSupported()) return

  const now = new Date()
  const prevSync = lastSyncAt ? new Date(lastSyncAt) : new Date(0)

  for (const a of assignments) {
    if (!a.dueAt) continue
    if (a.submissionState === 'submitted' || a.submissionState === 'graded') continue

    const dueDate = new Date(a.dueAt)

    for (const leadMinutes of leadTimes) {
      const fireAt = new Date(dueDate.getTime() - leadMinutes * 60_000)
      const key = `${a.id}:${leadMinutes}`

      if (fired.has(key)) continue
      // Only fire if this window (prevSync, now] contains the fire time
      if (fireAt <= prevSync || fireAt > now) continue

      fired.add(key)

      const hours = leadMinutes / 60
      const timeLabel =
        leadMinutes % 60 === 0
          ? `${hours} hour${hours !== 1 ? 's' : ''}`
          : `${leadMinutes} minutes`

      const n = new Notification({
        title: a.courseName,
        body: `${a.title} — due in ${timeLabel}`,
        silent: false,
      })
      const url = a.canvasUrl
      if (url) n.on('click', () => shell.openExternal(url))
      n.show()
    }
  }
}

// Fires a silent test notification — causes macOS to prompt for permission on first run
export function requestNotificationPermission(): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: 'Canvas Dashboard',
    body: "You'll be notified before assignments are due.",
    silent: true,
  })
  n.show()
}
