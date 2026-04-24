import axios from 'axios'
import type { Assignment, Course } from '../src/shared/types'

const COURSE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

function courseColorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

function extractCsrfToken(cookie: string): string | undefined {
  const match = cookie.match(/_csrf_token=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : undefined
}

type SubmissionState = 'submitted' | 'unsubmitted' | 'graded' | 'unknown'

function mapSubmissionState(state?: string): SubmissionState {
  if (state === 'submitted') return 'submitted'
  if (state === 'graded') return 'graded'
  if (state === 'unsubmitted' || state === 'pending_review') return 'unsubmitted'
  return 'unknown'
}

const GQL_QUERY = `{
  allCourses {
    _id
    name
    assignmentsConnection {
      nodes {
        _id
        name
        dueAt
        pointsPossible
        htmlUrl
        submissionsConnection {
          nodes {
            workflowState
          }
        }
      }
    }
  }
}`

interface GQLAssignmentNode {
  _id: string
  name: string
  dueAt: string | null
  pointsPossible: number | null
  htmlUrl: string
  submissionsConnection: { nodes: Array<{ workflowState: string }> }
}

interface GQLCourse {
  _id: string
  name: string
  assignmentsConnection: { nodes: GQLAssignmentNode[] }
}

interface GQLResponse {
  data: { allCourses: GQLCourse[] }
  errors?: Array<{ message: string }>
}

export async function fetchAssignmentsViaGraphQL(
  baseUrl: string,
  cookie: string,
  lookaheadDays: number,
  storedCourses: Course[],
): Promise<{ assignments: Assignment[]; courses: Course[] }> {
  const csrfToken = extractCsrfToken(cookie)

  const resp = await axios.post<GQLResponse>(
    `${baseUrl}/api/graphql`,
    { query: GQL_QUERY },
    {
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      timeout: 20_000,
    },
  )

  const gqlCourses = resp.data?.data?.allCourses
  if (!gqlCourses) throw new Error('Invalid GraphQL response — check session cookie')

  const storedMap = new Map(storedCourses.map(c => [c.id, c]))
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + lookaheadDays)

  const courses: Course[] = []
  const assignments: Assignment[] = []

  for (const gqlCourse of gqlCourses) {
    const courseId = gqlCourse._id
    const stored = storedMap.get(courseId)
    const course: Course = stored ?? {
      id: courseId,
      name: gqlCourse.name,
      color: courseColorFromName(gqlCourse.name),
      hidden: false,
    }
    courses.push(course)
    if (course.hidden) continue

    for (const node of gqlCourse.assignmentsConnection.nodes) {
      if (node.dueAt && new Date(node.dueAt) > cutoff) continue

      const submissionState = mapSubmissionState(node.submissionsConnection.nodes[0]?.workflowState)
      const isOverdue = node.dueAt !== null && new Date(node.dueAt) < now && submissionState === 'unsubmitted'

      assignments.push({
        id: `gql-${node._id}`,
        title: node.name,
        courseId,
        courseName: gqlCourse.name,
        courseColor: course.color,
        dueAt: node.dueAt,
        type: 'assignment',
        submissionState,
        pointsPossible: node.pointsPossible,
        canvasUrl: node.htmlUrl,
        isOverdue,
        source: 'graphql',
      })
    }
  }

  return { assignments, courses }
}
