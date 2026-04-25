import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Must mock axios before importing the module under test
vi.mock('axios', () => {
  const mockGet = vi.fn()
  return { default: { get: mockGet, isAxiosError: vi.fn(() => false) } }
})

import axios from 'axios'
import { scrapeResubsPage } from '../cseScraper'

const resubsHtml = readFileSync(
  join(__dirname, 'fixtures/resubs.html'),
  'utf-8',
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scrapeResubsPage', () => {
  it('extracts R1 (Resub 1) with a non-empty canvasUrl', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: resubsHtml, status: 200 })

    const results = await scrapeResubsPage(
      'https://courses.cs.washington.edu/courses/cse123/26sp/',
      2026,
      'cse123',
      'CSE 123',
      '#3B82F6',
    )

    const r1 = results.find(a => a.title === 'Resub 1')
    expect(r1).toBeDefined()
    expect(r1!.canvasUrl).toBeTruthy()
    expect(r1!.canvasUrl).toContain('docs.google.com/forms')
  })

  it('handles unquoted href (like the real CSE site produces)', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: resubsHtml, status: 200 })

    const results = await scrapeResubsPage(
      'https://courses.cs.washington.edu/courses/cse123/26sp/',
      2026,
      'cse123',
      'CSE 123',
      '#3B82F6',
    )

    // R1's href is unquoted in the fixture — should still be extracted
    const r1 = results.find(a => a.title === 'Resub 1')
    expect(r1!.canvasUrl).toBe('https://docs.google.com/forms/d/abc123/viewform')
  })

  it('extracts all resubmission entries', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: resubsHtml, status: 200 })

    const results = await scrapeResubsPage(
      'https://courses.cs.washington.edu/courses/cse123/26sp/',
      2026,
      'cse123',
      'CSE 123',
      '#3B82F6',
    )

    expect(results).toHaveLength(2)
    expect(results.every(a => a.source === 'cse-site')).toBe(true)
    expect(results.every(a => a.type === 'resubmission')).toBe(true)
  })

  it('returns empty array if Resubmission Forms section is absent', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: '<html><body>No resubs here</body></html>', status: 200 })

    const results = await scrapeResubsPage(
      'https://courses.cs.washington.edu/courses/cse123/26sp/',
      2026,
      'cse123',
      'CSE 123',
      '#3B82F6',
    )

    expect(results).toHaveLength(0)
  })

  it('returns empty array if the fetch fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))

    const results = await scrapeResubsPage(
      'https://courses.cs.washington.edu/courses/cse123/26sp/',
      2026,
      'cse123',
      'CSE 123',
      '#3B82F6',
    )

    expect(results).toHaveLength(0)
  })
})
