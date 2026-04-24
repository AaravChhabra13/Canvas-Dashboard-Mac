import { CanvasAssignment } from "./ical";
import { isToday, isTomorrow, isThisWeek, isPast, isAfter, addDays } from "date-fns";

export type GroupKey = "overdue" | "today" | "tomorrow" | "week" | "later" | "noDate";

export const GROUP_LABELS: Record<GroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This Week",
  later: "Later",
  noDate: "No Due Date",
};

export const GROUP_ORDER: GroupKey[] = ["overdue", "today", "tomorrow", "week", "later", "noDate"];

export function groupAssignment(a: CanvasAssignment): GroupKey {
  if (!a.due) return "noDate";
  const now = new Date();
  if (isPast(a.due) && !isToday(a.due)) return "overdue";
  if (isToday(a.due)) return "today";
  if (isTomorrow(a.due)) return "tomorrow";
  if (isThisWeek(a.due, { weekStartsOn: 1 })) return "week";
  if (isAfter(a.due, addDays(now, 7))) return "later";
  return "later";
}

export function groupAssignments(assignments: CanvasAssignment[]) {
  const groups: Record<GroupKey, CanvasAssignment[]> = {
    overdue: [], today: [], tomorrow: [], week: [], later: [], noDate: [],
  };
  for (const a of assignments) groups[groupAssignment(a)].push(a);
  for (const k of GROUP_ORDER) {
    groups[k].sort((a, b) => {
      if (!a.due) return 1;
      if (!b.due) return -1;
      return a.due.getTime() - b.due.getTime();
    });
  }
  return groups;
}
