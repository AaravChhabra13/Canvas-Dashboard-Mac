// Lightweight ICS parser tailored for Canvas calendar feeds.
// Canvas exports each assignment as a VEVENT with SUMMARY containing the
// assignment title, DESCRIPTION with course info + URL, and DTSTART as the due date.

export interface CanvasAssignment {
  id: string;
  title: string;
  course: string;
  due: Date | null;
  url?: string;
  description?: string;
}

function unfold(text: string): string {
  // RFC5545: lines beginning with space/tab continue the previous line
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDate(raw: string): Date | null {
  if (!raw) return null;
  // Forms: 20250115T235900Z, 20250115T235900, 20250115
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "23", mi = "59", s = "00", z] = m;
  if (z) {
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  }
  return new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

function extractCourse(description: string, summary: string): string {
  // Canvas often appends "[Course Name]" to summary
  const bracket = summary.match(/\[([^\]]+)\]\s*$/);
  if (bracket) return bracket[1].trim();
  // Or in description: "Course: Foo"
  const desc = description.match(/Course:\s*([^\n]+)/i);
  if (desc) return desc[1].trim();
  return "General";
}

function cleanTitle(summary: string): string {
  return summary.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
}

function extractUrl(description: string): string | undefined {
  const m = description.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : undefined;
}

export function parseICS(ics: string): CanvasAssignment[] {
  const text = unfold(ics);
  const events: CanvasAssignment[] = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0];
    const fields: Record<string, string> = {};
    for (const line of body.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const key = keyPart.split(";")[0].toUpperCase();
      fields[key] = value;
    }
    const summary = unescape(fields.SUMMARY || "");
    const description = unescape(fields.DESCRIPTION || "");
    if (!summary) continue;
    events.push({
      id: fields.UID || `${summary}-${fields.DTSTART}`,
      title: cleanTitle(summary),
      course: extractCourse(description, summary),
      due: parseDate(fields.DTSTART || fields.DTEND || ""),
      url: extractUrl(description) || fields.URL,
      description: description.slice(0, 500),
    });
  }
  return events;
}
