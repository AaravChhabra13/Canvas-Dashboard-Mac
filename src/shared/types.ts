export interface Assignment {
  id: string
  title: string
  courseId: string
  courseName: string
  courseColor: string
  dueAt: string | null  // ISO 8601, null = no due date
  type: 'assignment' | 'quiz' | 'discussion' | 'announcement'
  submissionState: 'submitted' | 'unsubmitted' | 'graded' | 'unknown'
  pointsPossible: number | null
  canvasUrl: string
  isOverdue: boolean
  source: 'rest' | 'ical'
}

export interface BucketedAssignments {
  overdue: Assignment[]
  today: Assignment[]
  tomorrow: Assignment[]
  thisWeek: Assignment[]
  comingUp: Assignment[]
  noDueDate: Assignment[]
}

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error?: string
}

export interface Settings {
  canvasIcalUrl: string
  syncIntervalMinutes: number
  lookaheadDays: number
}
