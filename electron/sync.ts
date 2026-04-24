import { createRequire } from 'node:module'
import axios from 'axios'
import type { Assignment, Course } from '../src/shared/types'
import { getToken, fetchCoursesFromApi, fetchPlannerItems } from './canvasApi'

// ical.js is CJS; use createRequire so Rollup passes it through at runtime
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICAL = _require('ical.js') as any

export interface SyncResult {
  assignments: Assignment[]
  courses: Course[]
}

// Merge freshly fetched courses with stored ones, preserving user's color/hidden edits
function mergeCourses(fresh: Course[], stored: Course[]): Course[] {
  const storedMap = new Map(stored.map(c => [c.id, c]))
  return fresh.map(c => {
    const existing = storedMap.get(c.id)
    return existing ? { ...c, color: existing.color, hidden: existing.hidden } : c
  })
}

export async function syncAll(
  baseUrl: string,
  icalUrl: string,
  lookaheadDays: number,
  storedCourses: Course[],
): Promise<SyncResult> {
  const token = getToken()

  if (token) {
    const freshCourses = await fetchCoursesFromApi(baseUrl, token)
    const mergedCourses = mergeCourses(freshCourses, storedCourses)
    const assignments = await fetchPlannerItems(baseUrl, token, lookaheadDays, mergedCourses)
    return { assignments, courses: mergedCourses }
  }

  if (icalUrl) {
    const assignments = await fetchAssignmentsFromIcal(icalUrl)
    return { assignments, courses: [] }
  }

  return { assignments: [], courses: [] }
}

// ── iCal path (Phase 1, kept as fallback) ───────────────────────────────────

const COURSE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

function courseColorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

async function fetchAssignmentsFromIcal(icalUrl: string): Promise<Assignment[]> {
  const response = await axios.get<string>(icalUrl, {
    timeout: 15_000,
    headers: { 'User-Agent': 'CanvasDashboard/1.0' },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jcalData: any
  try {
    jcalData = ICAL.parse(response.data)
  } catch {
    throw new Error('Failed to parse iCal feed')
  }

  const comp = new ICAL.Component(jcalData)
  const vevents: unknown[] = comp.getAllSubcomponents('vevent')
  const now = new Date()
  const assignments: Assignment[] = []

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent)
      const dtstart = event.startDate
      if (!dtstart) continue

      const dueAt = (dtstart.toJSDate() as Date).toISOString()
      const summary: string = event.summary || 'Untitled'
      const description: string = event.description || ''
      const uid: string = event.uid || `ical-${Date.now()}-${Math.random()}`

      // Canvas iCal description: first non-empty line = course name, then URL
      let courseName = 'Unknown Course'
      let canvasUrl = ''

      const lines = description.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
      const urlIdx = lines.findIndex((l: string) => /^https?:\/\//i.test(l))
      if (urlIdx > 0) {
        courseName = lines[0]
        canvasUrl = lines[urlIdx]
      } else if (urlIdx === 0) {
        canvasUrl = lines[0]
      } else if (lines.length > 0) {
        courseName = lines[0]
      }

      courseName = courseName.replace(/<[^>]+>/g, '').trim() || 'Unknown Course'

      assignments.push({
        id: uid,
        title: summary,
        courseId: courseName.toLowerCase().replace(/\W+/g, '_'),
        courseName,
        courseColor: courseColorFromName(courseName),
        dueAt,
        type: 'assignment',
        submissionState: 'unknown',
        pointsPossible: null,
        canvasUrl,
        isOverdue: new Date(dueAt) < now,
        source: 'ical',
      })
    } catch {
      // Skip malformed events, continue parsing
    }
  }

  return assignments
}
