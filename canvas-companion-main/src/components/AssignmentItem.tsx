import { CanvasAssignment } from "@/lib/ical";
import { format, formatDistanceToNowStrict, isPast, isToday } from "date-fns";
import { ExternalLink, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  assignment: CanvasAssignment;
  index: number;
  completed: boolean;
  onToggleComplete: (id: string) => void;
}

export const AssignmentItem = ({ assignment, index, completed, onToggleComplete }: Props) => {
  const overdue = !completed && assignment.due && isPast(assignment.due) && !isToday(assignment.due);
  const due = assignment.due;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: completed ? 0.5 : 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      className="group glass-inset rounded-xl p-3 flex items-start gap-3 hover:bg-white/[0.03] transition-colors"
    >
      <div className="pt-0.5">
        <Checkbox
          checked={completed}
          onCheckedChange={() => onToggleComplete(assignment.id)}
          aria-label={completed ? "Mark as incomplete" : "Mark as complete"}
        />
      </div>

      <a
        href={assignment.url}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 flex flex-col gap-1.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
              {assignment.course}
            </div>
            <div
              className={`text-sm font-medium leading-snug truncate ${
                completed ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {assignment.title}
            </div>
          </div>
          {assignment.url && (
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
          )}
        </div>
        {due && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock
              className="w-3 h-3"
              style={{ color: overdue ? "hsl(var(--danger))" : "hsl(var(--muted-foreground))" }}
            />
            <span style={{ color: overdue ? "hsl(var(--danger))" : "hsl(var(--muted-foreground))" }}>
              {format(due, "MMM d, h:mm a")} · {overdue ? "overdue " : ""}
              {formatDistanceToNowStrict(due, { addSuffix: true })}
            </span>
          </div>
        )}
      </a>
    </motion.div>
  );
};
