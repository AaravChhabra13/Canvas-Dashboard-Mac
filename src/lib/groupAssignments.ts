import { isToday, isTomorrow, isThisWeek, isPast, isAfter, addDays } from 'date-fns'
import type { Assignment } from '../shared/types'

export type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'noDate'

export const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This Week',
  later: 'Later',
  noDate: 'No Due Date',
}

export const GROUP_ORDER: GroupKey[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDate']

export function groupAssignment(a: Assignment): GroupKey {
  if (!a.dueAt) return 'noDate'
  const due = new Date(a.dueAt)
  const now = new Date()
  if (isPast(due) && !isToday(due)) return 'overdue'
  if (isToday(due)) return 'today'
  if (isTomorrow(due)) return 'tomorrow'
  if (isThisWeek(due, { weekStartsOn: 1 })) return 'week'
  if (isAfter(due, addDays(now, 7))) return 'later'
  return 'later'
}

export function groupAssignments(assignments: Assignment[]): Record<GroupKey, Assignment[]> {
  const groups: Record<GroupKey, Assignment[]> = {
    overdue: [], today: [], tomorrow: [], week: [], later: [], noDate: [],
  }
  for (const a of assignments) groups[groupAssignment(a)].push(a)
  for (const k of GROUP_ORDER) {
    groups[k].sort((a, b) => {
      if (!a.dueAt) return 1
      if (!b.dueAt) return -1
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    })
  }
  return groups
}
