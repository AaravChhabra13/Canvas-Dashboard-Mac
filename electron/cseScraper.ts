import axios from 'axios'
import type { Assignment, CseSiteEntry, Course } from '../src/shared/types'

// ── URL helpers ──────────────────────────────────────────────────────────────

function extractYearFromUrl(url: string): number {
  const m = url.match(/\/(\d{2})(au|wi|sp|su)\//i)
  if (m) return 2000 + parseInt(m[1])
  return new Date().getFullYear()
}

function resolveUrl(href: string, baseUrl: string): string {
  if (!href || href.startsWith('mailto:') || href.startsWith('#')) return ''
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('//')) return 'https:' + href
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = []
  // Handle all three quoting styles the CSE site uses:
  //   href="url"  (double-quoted)
  //   href='url'  (single-quoted)
  //   href=url    (unquoted — what the CSE Bootstrap template actually outputs)
  const re = /href=(?:"([^"]+)"|'([^']+)'|([^\s>"']+))/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = m[1] ?? m[2] ?? m[3] ?? ''
    const resolved = resolveUrl(href, baseUrl)
    if (resolved) links.push(resolved)
  }
  return links
}

function bestUrl(links: string[]): string {
  return (
    links.find(l => l.includes('edstem.org')) ??
    links.find(l => l.includes('gradescope.com')) ??
    links.find(l => l.endsWith('.pdf')) ??
    links[0] ??
    ''
  )
}

// ── Due date parsing ─────────────────────────────────────────────────────────

function parseDueDate(text: string, year: number): Date | null {
  // Handles: "Initial Submission by Wednesday 05/06 at 11:59PM PT"
  //          "Due Wednesday 04/02 at 11:59 PM"
  //          "05/06 at 11:59PM"
  // Picks the first date found in the string (Initial > Final for multi-date lines)
  const full = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i)
  if (full) {
    const month = parseInt(full[1]) - 1
    const day = parseInt(full[2])
    const y = full[3] ? parseInt(full[3].length === 2 ? `20${full[3]}` : full[3]) : year
    let h = parseInt(full[4])
    const min = parseInt(full[5])
    const ap = full[6].toUpperCase()
    if (ap === 'PM' && h !== 12) h += 12
    if (ap === 'AM' && h === 12) h = 0
    return new Date(y, month, day, h, min, 0)
  }
  // Fallback: bare MM/DD defaults to 11:59 PM
  const short = text.match(/(\d{1,2})\/(\d{1,2})/)
  if (short) {
    return new Date(year, parseInt(short[1]) - 1, parseInt(short[2]), 23, 59, 0)
  }
  return null
}

// ── Assignment type detection ────────────────────────────────────────────────

function detectAssignmentType(title: string): Assignment['type'] {
  if (/^C\d/i.test(title)) return 'creative'
  if (/^R\d/i.test(title)) return 'resubmission'
  return 'assignment'
}

// ── Course color hash (mirrors sync.ts) ─────────────────────────────────────

const COURSE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

function courseColorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

// ── Parser: h5-based Markdown-rendered pages (primary) ───────────────────────
//
// UW CSE course sites are Jekyll/static-site blogs rendered from Markdown.
// Each assignment appears as an h5 heading followed by bold due-date text
// and anchor links:
//
//   <h5 id="p1---mini-git">P1 - Mini-Git</h5>
//   <p><strong>Initial Submission by Wednesday 05/06 at 11:59PM PT.</strong></p>
//   <p><a href="/...">Specification</a> | <a href="https://edstem.org/...">Submit on Ed</a></p>
//
// Strategy: split the cleaned HTML on every <h5 opening tag.
// Each resulting segment starts with the h5 content (up to </h5>) then the body.
// The body is trimmed at the next h1–h4 (section headings).

function parseH5Blocks(
  cleaned: string,
  siteUrl: string,
  year: number,
  results: Assignment[],
  seen: Set<string>,
  now: Date,
  courseId: string,
  courseName: string,
  courseColor: string,
): void {
  // Split on <h5 so each segment = attrs+title</h5>body
  const segments = cleaned.split(/<h5[^>]*>/i)
  console.log(`[cseScraper] h5 strategy: ${segments.length - 1} h5 segments found`)

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]

    // Everything before </h5> is the title HTML
    const closeH5 = seg.search(/<\/h5>/i)
    if (closeH5 < 0) {
      console.log(`[cseScraper] segment ${i}: no </h5> found, skipping`)
      continue
    }
    const titleHtml = seg.substring(0, closeH5)
    let bodyHtml = seg.substring(closeH5 + 5) // skip past </h5>

    // Trim the body at any h1–h4 so we don't bleed into the next section heading
    const nextSection = bodyHtml.search(/<h[1-4][^>]*>/i)
    if (nextSection >= 0) bodyHtml = bodyHtml.substring(0, nextSection)

    const title = stripTags(titleHtml).trim()
    if (!title || title.length < 2) {
      console.log(`[cseScraper] segment ${i}: empty title, skipping`)
      continue
    }
    if (/no assignment|coming soon|tbd|released later/i.test(title)) {
      console.log(`[cseScraper] segment ${i}: placeholder title "${title}", skipping`)
      continue
    }

    console.log(`[cseScraper] segment ${i}: title="${title}"`)
    console.log(`[cseScraper] segment ${i}: body (first 200): ${bodyHtml.substring(0, 200).replace(/\n/g, ' ')}`)

    // Due date — look for the first <strong> or <b> that contains a date pattern.
    // Multiple <strong> can exist (initial + final deadlines); we want the first one.
    // \b after the tag name prevents matching <br>, <button>, <blockquote>, etc.
    let dueDate: Date | null = null
    const strongRegex = /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi
    let sm: RegExpExecArray | null
    while ((sm = strongRegex.exec(bodyHtml)) !== null) {
      const candidate = stripTags(sm[2])   // sm[1]=tag name, sm[2]=inner content
      const parsed = parseDueDate(candidate, year)
      if (parsed) {
        dueDate = parsed
        console.log(`[cseScraper] segment ${i}: due date text="${candidate}" → ${parsed.toISOString()}`)
        break
      }
    }
    if (!dueDate) {
      console.log(`[cseScraper] segment ${i}: no due date found in bold text`)
    }

    // URLs — prefer EdStem > Gradescope > PDF > anything else
    const links = extractLinksFromHtml(bodyHtml, siteUrl)
    const chosenUrl = bestUrl(links)
    console.log(`[cseScraper] segment ${i}: links=${JSON.stringify(links)} → chosen="${chosenUrl}"`)

    const slug = title.substring(0, 40).replace(/\W+/g, '-').toLowerCase()
    const id = `cse-site-${courseId}-${slug}`
    if (seen.has(id)) {
      console.log(`[cseScraper] segment ${i}: duplicate id "${id}", skipping`)
      continue
    }
    seen.add(id)

    results.push({
      id,
      title,
      courseId,
      courseName,
      courseColor,
      dueAt: dueDate ? dueDate.toISOString() : null,
      type: detectAssignmentType(title),
      submissionState: 'unknown',
      pointsPossible: null,
      canvasUrl: chosenUrl,
      isOverdue: dueDate ? dueDate < now : false,
      source: 'cse-site',
    })
    console.log(`[cseScraper] segment ${i}: ✓ added assignment "${title}"`)
  }
}

// ── Parser: table-based pages (fallback) ─────────────────────────────────────
//
// Some older CSE courses use Bootstrap tables:
//   <tr><td>P1 - Mini-Git</td><td>05/06 at 11:59PM</td><td><a>Submit</a></td></tr>

function parseTableRows(
  cleaned: string,
  siteUrl: string,
  year: number,
  results: Assignment[],
  seen: Set<string>,
  now: Date,
  courseId: string,
  courseName: string,
  courseColor: string,
): void {
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null
  let rowCount = 0

  while ((trMatch = trRegex.exec(cleaned)) !== null) {
    const rowHtml = trMatch[1]
    if (/<th[^>]*>/i.test(rowHtml)) continue

    const cells: string[] = []
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
    let tdMatch: RegExpExecArray | null
    while ((tdMatch = tdRegex.exec(rowHtml)) !== null) cells.push(tdMatch[1])
    if (cells.length < 2) continue

    let titleHtml = '', dueDateHtml = '', linksHtml = ''
    for (const cell of cells) {
      const text = stripTags(cell)
      const isDate =
        /\d{1,2}\/\d{1,2}/.test(text) &&
        (/at\s+\d{1,2}:\d{2}/i.test(text) || /\bPT\b|\bPST\b|\bPDT\b/i.test(text))
      const isTitle = !isDate && (/^[PCRpcr]\d/.test(text.trim()) || (text.trim().length > 3 && /href/i.test(cell)))
      const isLinks = !isDate && !isTitle && /submit|edstem|gradescope|spec|pdf/i.test(cell)
      if (isTitle && !titleHtml) titleHtml = cell
      if (isDate && !dueDateHtml) dueDateHtml = cell
      if (isLinks && !linksHtml) linksHtml = cell
    }
    if (!titleHtml) titleHtml = cells[0]
    if (!dueDateHtml) dueDateHtml = cells[1] ?? ''
    if (!linksHtml && cells.length >= 3) linksHtml = cells[2]

    const title = stripTags(titleHtml).trim()
    if (!title || title.length < 2) continue
    if (/no assignment|coming soon|tbd|released later/i.test(title)) continue

    const allLinks = [
      ...extractLinksFromHtml(titleHtml, siteUrl),
      ...extractLinksFromHtml(linksHtml, siteUrl),
    ]
    const chosenUrl = bestUrl(allLinks)
    const dueDate = parseDueDate(stripTags(dueDateHtml), year)
    const slug = title.substring(0, 40).replace(/\W+/g, '-').toLowerCase()
    const id = `cse-site-${courseId}-${slug}`
    if (seen.has(id)) continue
    seen.add(id)
    rowCount++

    results.push({
      id, title, courseId, courseName, courseColor,
      dueAt: dueDate ? dueDate.toISOString() : null,
      type: detectAssignmentType(title),
      submissionState: 'unknown',
      pointsPossible: null,
      canvasUrl: chosenUrl,
      isOverdue: dueDate ? dueDate < now : false,
      source: 'cse-site',
    })
  }
  console.log(`[cseScraper] table fallback: found ${rowCount} assignments`)
}

// ── Main HTML dispatcher ─────────────────────────────────────────────────────

function parseAssignmentsFromHtml(
  html: string,
  siteUrl: string,
  courseName: string,
  storedCourses: Course[],
): Assignment[] {
  console.log(`[cseScraper] Parsing HTML: ${html.length} chars for "${courseName}"`)
  console.log(`[cseScraper] HTML preview (first 400): ${html.substring(0, 400).replace(/\n/g, ' ')}`)

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  const year = extractYearFromUrl(siteUrl)
  console.log(`[cseScraper] Extracted year: ${year}`)

  const matchedCourse = storedCourses.find(c =>
    c.name.toLowerCase().includes(courseName.toLowerCase().trim()) ||
    courseName.toLowerCase().trim().includes(c.name.toLowerCase()),
  )
  const courseId = matchedCourse?.id ?? courseName.toLowerCase().replace(/\W+/g, '_')
  const courseColor = matchedCourse?.color ?? courseColorFromName(courseName)
  console.log(`[cseScraper] courseId="${courseId}", matched stored course: ${matchedCourse?.name ?? 'none'}`)

  const results: Assignment[] = []
  const seen = new Set<string>()
  const now = new Date()

  // Choose parser based on page structure
  const h5Count = (cleaned.match(/<h5/gi) ?? []).length
  const tableCount = (cleaned.match(/<table/gi) ?? []).length
  console.log(`[cseScraper] Structure detection: h5=${h5Count}, tables=${tableCount}`)

  if (h5Count > 0) {
    parseH5Blocks(cleaned, siteUrl, year, results, seen, now, courseId, courseName, courseColor)
  }

  // Fall back to table strategy if h5 found nothing
  if (results.length === 0 && tableCount > 0) {
    console.log(`[cseScraper] h5 strategy yielded 0 results, trying table fallback`)
    parseTableRows(cleaned, siteUrl, year, results, seen, now, courseId, courseName, courseColor)
  }

  console.log(`[cseScraper] ── Total: ${results.length} assignments parsed for "${courseName}" ──`)
  for (const a of results) {
    console.log(`[cseScraper]   • ${a.title} | due=${a.dueAt ?? 'none'} | url=${a.canvasUrl || '(none)'}`)
  }

  return results
}

// ── Calendar parser ──────────────────────────────────────────────────────────
//
// The home page (base URL) has a Bootstrap table with class "course-calendar".
// Each date in the table is TWO <tr> sub-rows:
//   - A-row: has id="calendar-row-MM-DD" and the date cell
//   - B-row: no id, has the assignment <td rowspan=N> if one starts on this date
//
// An assignment cell spans N consecutive sub-rows.  Due date = the date of the
// sub-row at index (assignment_start_index + rowspan - 1).
// This is verified: C0 rowspan=9 from 04-02-B → ends at 04-08-A (Wed 04/08 ✓).
//
// The calendar lists ALL quarter assignments, including unreleased ones.
// Released ones have an "assignment-released" boundary inside their cell.
// Only released assignments also appear on the /assignments/ page (with EdStem URLs).

interface SubRow {
  date: string   // 'MM-DD' — inherited from the last calendar-row id seen; '' before first
  html: string
}

function buildCalendarSubRows(tbodyHtml: string): SubRow[] {
  const rows: SubRow[] = []
  let lastDate = ''
  const trRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi
  let m: RegExpExecArray | null
  while ((m = trRegex.exec(tbodyHtml)) !== null) {
    const block = m[0]
    const idMatch = block.match(/id=calendar-row-(\d{2}-\d{2})/)
    if (idMatch) lastDate = idMatch[1]
    rows.push({ date: lastDate, html: block })
  }
  return rows
}

async function scrapeCalendarPage(
  siteUrl: string,
  year: number,
  courseId: string,
  courseName: string,
  courseColor: string,
): Promise<Assignment[]> {
  console.log(`[cseScraper:cal] Fetching calendar at ${siteUrl}`)

  let html: string
  try {
    const response = await axios.get<string>(siteUrl, {
      timeout: 12_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    html = response.data
    console.log(`[cseScraper:cal] HTTP ${response.status}`)
  } catch (e) {
    console.error(`[cseScraper:cal] Failed to fetch ${siteUrl}:`, e instanceof Error ? e.message : e)
    return []
  }

  // Find the course-calendar table tbody (quoted or unquoted class attribute)
  const tbodyMatch = html.match(/class=["']?[^"'>]*course-calendar[^"'>]*["']?[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)
  if (!tbodyMatch) {
    console.log('[cseScraper:cal] No course-calendar tbody found on home page')
    return []
  }
  const tbody = tbodyMatch[1]

  const rows = buildCalendarSubRows(tbody)
  console.log(`[cseScraper:cal] ${rows.length} sub-rows in calendar tbody`)

  const results: Assignment[] = []
  const seen = new Set<string>()
  const now = new Date()

  for (let i = 0; i < rows.length; i++) {
    const block = rows[i].html

    // Assignment cells have class="assignment ..." AND a rowspan attribute
    if (!block.includes('class="assignment') || !block.includes('rowspan=')) continue

    const rowspanMatch = block.match(/rowspan=(\d+)/)
    if (!rowspanMatch) continue
    const rowspan = parseInt(rowspanMatch[1])

    // Due date = the date tag of the sub-row where this cell ends
    const endIdx = Math.min(i + rowspan - 1, rows.length - 1)
    const dueDateStr = rows[endIdx].date  // 'MM-DD' or ''

    // assignment-label contains the short code: C0, P1, R0, QUIZ 00, etc.
    const labelMatch = block.match(/class="[^"]*assignment-label[^"]*">([^<]+)/)
    if (!labelMatch) continue
    const code = labelMatch[1].trim()

    // assignment-title contains the human name: Warm Up, Mini-Git, etc.
    const titleMatch = block.match(/class=assignment-title>([^<]+)/)
    if (!titleMatch) continue
    const fullTitle = `${code} - ${titleMatch[1].trim()}`

    // Assignment type from the code prefix
    let type: Assignment['type'] = 'assignment'
    if (/^C\d/i.test(code)) type = 'creative'
    else if (/^R\d/i.test(code)) type = 'resubmission'
    else if (/^QUIZ/i.test(code)) type = 'quiz'

    // Due date at 11:59 PM (all CSE 123 assignments use this deadline)
    let dueDate: Date | null = null
    if (dueDateStr) {
      const parts = dueDateStr.split('-')
      const mm = parseInt(parts[0])
      const dd = parseInt(parts[1])
      dueDate = new Date(year, mm - 1, dd, 23, 59, 0)
    }

    const isReleased = block.includes('assignment-released')

    // Use code-based ID so it's stable regardless of which scraper found it first
    const id = `cse-cal-${courseId}-${code.toLowerCase().replace(/\W+/g, '-')}`
    if (seen.has(id)) continue
    seen.add(id)

    console.log(`[cseScraper:cal] ${fullTitle} | due=${dueDateStr ?? 'none'} | released=${isReleased}`)

    results.push({
      id,
      title: fullTitle,
      courseId,
      courseName,
      courseColor,
      dueAt: dueDate ? dueDate.toISOString() : null,
      type,
      submissionState: 'unknown',
      pointsPossible: null,
      canvasUrl: '',   // calendar cells don't carry specific assignment links
      isOverdue: dueDate ? dueDate < now : false,
      source: 'cse-site',
    })
  }

  console.log(`[cseScraper:cal] ── ${results.length} assignments from calendar ──`)
  return results
}

// ── Resubs page scraper ──────────────────────────────────────────────────────
//
// The /resubs/ page lists released resubmission forms as bare <li> items inside
// a <div class="Resubmission Forms"> container:
//
//   <li><a href="https://docs.google.com/forms/...">Resub 1</a>:
//       due by Friday 04/24. Eligible for resubmission: C0, P0.</li>
//
// We extract the Google Form URL and due date for each resub.
// These are merged into the calendar R# entries (which have due dates but no URLs).

export async function scrapeResubsPage(
  siteUrl: string,
  year: number,
  courseId: string,
  courseName: string,
  courseColor: string,
): Promise<Assignment[]> {
  const resubsUrl = (siteUrl.endsWith('/') ? siteUrl : siteUrl + '/') + 'resubs/'
  console.log(`[cseScraper:resubs] Fetching ${resubsUrl}`)

  let html: string
  try {
    const response = await axios.get<string>(resubsUrl, {
      timeout: 12_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    html = response.data
    console.log(`[cseScraper:resubs] HTTP ${response.status}`)
  } catch (e) {
    console.error(`[cseScraper:resubs] Failed to fetch ${resubsUrl}:`, e instanceof Error ? e.message : e)
    return []
  }

  // Find the "Resubmission Forms" section div
  const sectionMatch = html.match(/class="Resubmission Forms"[^>]*>([\s\S]*?)<\/div>/i)
  if (!sectionMatch) {
    console.log('[cseScraper:resubs] Resubmission Forms section not found on resubs page')
    return []
  }
  const section = sectionMatch[1]

  const results: Assignment[] = []
  const seen = new Set<string>()
  const now = new Date()

  const liRegex = /<li>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = liRegex.exec(section)) !== null) {
    const liHtml = m[1]

    // Extract the form URL (first link in the <li>)
    const links = extractLinksFromHtml(liHtml, resubsUrl)
    const formUrl = links[0] ?? ''
    if (!formUrl) continue

    // Extract link text: "Resub 1", "Resub 0", etc.
    const linkTextMatch = liHtml.match(/<a[^>]*>([^<]+)<\/a>/)
    if (!linkTextMatch) continue
    const linkText = linkTextMatch[1].trim()

    // Due date from surrounding text: "due by Friday 04/24"
    const liText = stripTags(liHtml)
    const dueDate = parseDueDate(liText, year)
    const dueDateShort = liText.match(/(\d{1,2})\/(\d{1,2})/)?.[0] ?? 'none'

    console.log(`[cseScraper:resubs] ${linkText} | due=${dueDateShort} | url=${formUrl}`)

    const id = `cse-resub-${courseId}-${linkText.toLowerCase().replace(/\W+/g, '-')}`
    if (seen.has(id)) continue
    seen.add(id)

    results.push({
      id,
      title: linkText,           // "Resub 1" — used only for title-overlap matching; merged result keeps calendar's richer title
      courseId,
      courseName,
      courseColor,
      dueAt: dueDate ? dueDate.toISOString() : null,
      type: 'resubmission',
      submissionState: 'unknown',
      pointsPossible: null,
      canvasUrl: formUrl,
      isOverdue: dueDate ? dueDate < now : false,
      source: 'cse-site',
    })
  }

  console.log(`[cseScraper:resubs] ── ${results.length} resubmission forms found ──`)
  return results
}

// ── Internal merge: calendar base + page-specific overrides ──────────────────
//
// Calendar = full quarter (all assignments, canvasUrl = '')
// Overrides = released entries from /assignments/ or /resubs/ (have specific URLs)
//
// Strategy: for each calendar entry, if an override matches by title, upgrade
// only canvasUrl (and dueAt as fallback).  Calendar's richer title is preserved —
// e.g. "R1 - Resub 1" stays instead of being replaced by the resubs page's "Resub 1".

function mergeCalendarWithExact(calendar: Assignment[], overrides: Assignment[]): Assignment[] {
  const result = calendar.map(cal => {
    const match = overrides.find(o => titlesOverlap(o.title, cal.title))
    if (match) {
      return {
        ...cal,
        canvasUrl: match.canvasUrl || cal.canvasUrl,
        dueAt: match.dueAt ?? cal.dueAt,
      }
    }
    return cal
  })

  // Safety net: add any override entries that had no calendar counterpart
  for (const o of overrides) {
    if (!result.some(r => titlesOverlap(r.title, o.title))) {
      console.log(`[cseScraper] override entry not in calendar, appending: "${o.title}"`)
      result.push(o)
    }
  }

  return result
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function scrapeCseSite(
  entry: CseSiteEntry,
  storedCourses: Course[],
): Promise<Assignment[]> {
  const base = entry.url.endsWith('/') ? entry.url : entry.url + '/'
  const assignmentsUrl = base + 'assignments/'
  const year = extractYearFromUrl(entry.url)

  // Resolve course identity once for both scrapers
  const matchedCourse = storedCourses.find(c =>
    c.name.toLowerCase().includes(entry.courseName.toLowerCase().trim()) ||
    entry.courseName.toLowerCase().trim().includes(c.name.toLowerCase()),
  )
  const courseId = matchedCourse?.id ?? entry.courseName.toLowerCase().replace(/\W+/g, '_')
  const courseColor = matchedCourse?.color ?? courseColorFromName(entry.courseName)

  console.log(`[cseScraper] Starting dual-scrape for "${entry.courseName}"`)
  console.log(`[cseScraper]   assignments page: ${assignmentsUrl}`)
  console.log(`[cseScraper]   calendar page:    ${base}`)

  console.log(`[cseScraper]   resubs page:      ${base}resubs/`)

  // Fetch all three pages in parallel
  const [exactAssignments, calendarAssignments, resubsAssignments] = await Promise.all([
    // /assignments/ page — released assignments with EdStem/PDF URLs
    (async (): Promise<Assignment[]> => {
      try {
        const response = await axios.get<string>(assignmentsUrl, {
          timeout: 12_000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        })
        console.log(`[cseScraper] /assignments/ HTTP ${response.status}`)
        return parseAssignmentsFromHtml(response.data, assignmentsUrl, entry.courseName, storedCourses)
      } catch (e) {
        if (axios.isAxiosError(e)) {
          console.error(`[cseScraper] /assignments/ HTTP error: status=${e.response?.status ?? 'none'}, msg=${e.message}`)
        } else {
          console.error(`[cseScraper] /assignments/ error:`, e instanceof Error ? e.message : e)
        }
        return []
      }
    })(),

    // Home page calendar — all quarter assignments including unreleased
    scrapeCalendarPage(base, year, courseId, entry.courseName, courseColor),

    // /resubs/ page — Google Form URLs for resubmission assignments
    scrapeResubsPage(base, year, courseId, entry.courseName, courseColor),
  ])

  console.log(`[cseScraper] /assignments/ found ${exactAssignments.length}, calendar found ${calendarAssignments.length}, resubs found ${resubsAssignments.length}`)

  // Merge: calendar is the authoritative full list; /assignments/ and /resubs/ provide better URLs + times
  if (calendarAssignments.length === 0) {
    console.log('[cseScraper] Calendar returned nothing, using /assignments/ page only')
    return exactAssignments
  }

  const merged = mergeCalendarWithExact(calendarAssignments, [...exactAssignments, ...resubsAssignments])
  console.log(`[cseScraper] ── Merged total: ${merged.length} assignments for "${entry.courseName}" ──`)
  for (const a of merged) {
    const status = a.canvasUrl ? '✓ url' : '○ no-url'
    console.log(`[cseScraper]   ${status} ${a.title} | due=${a.dueAt ? a.dueAt.substring(0, 10) : 'none'}`)
  }

  return merged
}

// ── Merge helper (exported for sync.ts) ─────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .replace(/\[.*?\]/g, '')       // remove "[COURSE CODE]" suffixes from iCal
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

function titlesOverlap(a: string, b: string): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

/*
 * Merges CSE site assignments into existing Canvas assignments.
 * If a Canvas assignment matches by title + same-day due date, the Canvas entry
 * is updated with the better URL and marked as cse-site source.
 * New CSE assignments (not on Canvas) are appended.
 */
export function mergeCseAssignments(canvas: Assignment[], cse: Assignment[]): Assignment[] {
  const result = [...canvas]

  for (const ca of cse) {
    const idx = result.findIndex(a => {
      if (!titlesOverlap(a.title, ca.title)) return false
      if (!a.dueAt || !ca.dueAt) return false
      const diff = Math.abs(new Date(a.dueAt).getTime() - new Date(ca.dueAt).getTime())
      return diff < 36 * 60 * 60 * 1000  // within 36 hours = same assignment
    })

    if (idx >= 0) {
      // Prefer the CSE site URL; keep everything else from Canvas (course info, submissionState, etc.)
      result[idx] = { ...result[idx], canvasUrl: ca.canvasUrl, source: 'cse-site' }
    } else {
      result.push(ca)
    }
  }

  return result
}
