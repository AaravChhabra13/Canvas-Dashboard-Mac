import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw, Settings as SettingsIcon, BookOpen, Inbox, LogOut, CheckCheck, ChevronRight, ArrowLeft } from "lucide-react";
import { useCanvasFeed } from "@/hooks/useCanvasFeed";
import { useAuth } from "@/hooks/useAuth";
import { groupAssignments, GROUP_LABELS, GROUP_ORDER } from "@/lib/groupAssignments";
import { AssignmentItem } from "@/components/AssignmentItem";
import { SettingsPanel } from "@/components/SettingsPanel";
import { formatDistanceToNowStrict } from "date-fns";

const HIDE_OLD_KEY = "hide_old_overdue";

const Index = () => {
  const { assignments, loading, error, lastFetched, feedUrl, saveFeedUrl, refresh, completed, toggleCompleted } = useCanvasFeed();
  const { signOut } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<"assignments" | "courses">("assignments");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [hideOldOverdue, setHideOldOverdue] = useState<boolean>(() => {
    const raw = localStorage.getItem(HIDE_OLD_KEY);
    return raw === null ? true : raw === "true";
  });

  useEffect(() => {
    localStorage.setItem(HIDE_OLD_KEY, String(hideOldOverdue));
  }, [hideOldOverdue]);

  const visibleAssignments = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return assignments.filter((a) => {
      if (completed.has(a.id)) return false;
      if (hideOldOverdue && a.due && a.due.getTime() < oneDayAgo) return false;
      return true;
    });
  }, [assignments, completed, hideOldOverdue]);

  const overdueIds = useMemo(
    () => visibleAssignments.filter((a) => a.due && a.due.getTime() < Date.now()).map((a) => a.id),
    [visibleAssignments]
  );

  const groups = useMemo(() => groupAssignments(visibleAssignments), [visibleAssignments]);

  const courseList = useMemo(() => {
    const map = new Map<string, { name: string; total: number; overdue: number; upcoming: number }>();
    const now = Date.now();
    for (const a of visibleAssignments) {
      const entry = map.get(a.course) || { name: a.course, total: 0, overdue: 0, upcoming: 0 };
      entry.total += 1;
      if (a.due) {
        if (a.due.getTime() < now) entry.overdue += 1;
        else entry.upcoming += 1;
      }
      map.set(a.course, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [visibleAssignments]);

  const courseCount = courseList.length;
  const upcomingCount = visibleAssignments.filter((a) => a.due && a.due > new Date()).length;

  const courseAssignments = useMemo(() => {
    if (!selectedCourse) return [];
    return visibleAssignments.filter((a) => a.course === selectedCourse);
  }, [visibleAssignments, selectedCourse]);

  const courseGroups = useMemo(() => groupAssignments(courseAssignments), [courseAssignments]);

  const clearOverdue = async () => {
    for (const id of overdueIds) await toggleCompleted(id);
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center p-3 aurora">
      <div
        className="glass relative w-full max-w-md h-[600px] rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "calc(100vh - 24px)" }}
      >
        {/* Header */}
        <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5">
          <div>
            <h1 className="text-lg font-semibold text-gradient">Canvas</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1">
                <BookOpen className="w-3 h-3" /> {courseCount} courses
              </span>
              <span className="opacity-30">·</span>
              <span className="inline-flex items-center gap-1">
                <Inbox className="w-3 h-3" /> {upcomingCount} upcoming
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refresh()}
              disabled={loading || !feedUrl}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tabs */}
        {feedUrl && assignments.length > 0 && (
          <div className="px-4 pt-3 flex items-center gap-1">
            <TabButton active={tab === "assignments"} onClick={() => { setTab("assignments"); setSelectedCourse(null); }}>
              Assignments
            </TabButton>
            <TabButton active={tab === "courses"} onClick={() => { setTab("courses"); setSelectedCourse(null); }}>
              Courses <span className="ml-1 text-[10px] opacity-60">{courseCount}</span>
            </TabButton>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!feedUrl ? (
            <EmptyState onOpenSettings={() => setShowSettings(true)} />
          ) : error && assignments.length === 0 ? (
            <ErrorState message={error} onRetry={() => refresh()} />
          ) : assignments.length === 0 && loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : assignments.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No assignments found.</div>
          ) : tab === "assignments" ? (
            <GroupedList groups={groups} completed={completed} onToggle={toggleCompleted} />
          ) : selectedCourse ? (
            <div className="p-4 flex flex-col gap-3">
              <button
                onClick={() => setSelectedCourse(null)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> All courses
              </button>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{selectedCourse}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {courseAssignments.length} assignment{courseAssignments.length === 1 ? "" : "s"}
                </p>
              </div>
              {courseAssignments.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">No assignments.</div>
              ) : (
                <GroupedList groups={courseGroups} completed={completed} onToggle={toggleCompleted} compact />
              )}
            </div>
          ) : (
            <div className="p-4 flex flex-col gap-2">
              {courseList.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedCourse(c.name)}
                  className="glass-inset rounded-xl p-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <BookOpen className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{c.total} total</span>
                      {c.overdue > 0 && (
                        <>
                          <span className="opacity-30">·</span>
                          <span style={{ color: "hsl(var(--danger))" }}>{c.overdue} overdue</span>
                        </>
                      )}
                      {c.upcoming > 0 && (
                        <>
                          <span className="opacity-30">·</span>
                          <span>{c.upcoming} upcoming</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-2.5 border-t border-white/5 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
          <span className="truncate">
            {lastFetched
              ? `Updated ${formatDistanceToNowStrict(lastFetched, { addSuffix: true })}`
              : "Not synced"}
          </span>
          {overdueIds.length > 0 && (
            <button
              onClick={clearOverdue}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition-colors text-foreground/80"
              title="Mark all overdue as done"
            >
              <CheckCheck className="w-3 h-3" />
              Clear {overdueIds.length} overdue
            </button>
          )}
        </footer>

        {/* Settings overlay */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 glass"
            >
              <SettingsPanel
                feedUrl={feedUrl}
                hideOldOverdue={hideOldOverdue}
                onToggleHideOldOverdue={setHideOldOverdue}
                onSave={(url) => {
                  saveFeedUrl(url);
                  setShowSettings(false);
                }}
                onClose={() => setShowSettings(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const EmptyState = ({ onOpenSettings }: { onOpenSettings: () => void }) => (
  <div className="p-8 flex flex-col items-center text-center gap-4 mt-6">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
    >
      <BookOpen className="w-8 h-8 text-primary-foreground" />
    </div>
    <div>
      <h3 className="text-base font-semibold mb-1">Connect to Canvas</h3>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px]">
        Paste your Canvas calendar feed URL to see all your courses and assignments,
        grouped by due date.
      </p>
    </div>
    <button
      onClick={onOpenSettings}
      className="rounded-xl py-2 px-5 text-sm font-medium text-primary-foreground"
      style={{ background: "var(--gradient-primary)" }}
    >
      Add Feed URL
    </button>
  </div>
);

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="p-8 flex flex-col items-center text-center gap-3 mt-4">
    <p className="text-sm font-medium" style={{ color: "hsl(var(--danger))" }}>
      Couldn't load feed
    </p>
    <p className="text-xs text-muted-foreground max-w-[280px]">{message}</p>
    <button
      onClick={onRetry}
      className="text-xs px-4 py-1.5 rounded-lg glass-inset hover:bg-white/5 transition-colors"
    >
      Try again
    </button>
  </div>
);

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
    }`}
  >
    {children}
  </button>
);

const GroupedList = ({
  groups,
  completed,
  onToggle,
  compact = false,
}: {
  groups: ReturnType<typeof groupAssignments>;
  completed: Set<string>;
  onToggle: (id: string) => void;
  compact?: boolean;
}) => (
  <div className={`${compact ? "" : "p-4"} flex flex-col gap-5`}>
    {GROUP_ORDER.map((key) => {
      const items = groups[key];
      if (!items.length) return null;
      return (
        <section key={key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{
                color:
                  key === "overdue"
                    ? "hsl(var(--danger))"
                    : key === "today"
                    ? "hsl(var(--warning))"
                    : "hsl(var(--muted-foreground))",
              }}
            >
              {GROUP_LABELS[key]}
            </h2>
            <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((a, i) => (
              <AssignmentItem
                key={a.id}
                assignment={a}
                index={i}
                completed={completed.has(a.id)}
                onToggleComplete={onToggle}
              />
            ))}
          </div>
        </section>
      );
    })}
  </div>
);

export default Index;
