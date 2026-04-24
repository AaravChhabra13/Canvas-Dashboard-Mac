import { useCallback, useEffect, useState } from "react";
import { parseICS, CanvasAssignment } from "@/lib/ical";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { electron } from "@/lib/electron";

const CACHE_KEY = "canvas_feed_cache";

interface State {
  assignments: CanvasAssignment[];
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

async function fetchFeedViaServer(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("fetch-canvas-feed");
  if (error) {
    // Edge function returned non-2xx — try to surface body message
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const body = await ctx.text();
        try {
          const json = JSON.parse(body);
          throw new Error(json.error || error.message);
        } catch {
          throw new Error(body || error.message);
        }
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    throw new Error(error.message || "Failed to fetch feed");
  }
  // data is the raw iCal text (Content-Type text/calendar)
  if (typeof data === "string") return data;
  // Fallback: response was parsed; stringify back
  throw new Error("Unexpected response from server");
}

export function useCanvasFeed() {
  const { user } = useAuth();
  const [feedUrl, setFeedUrl] = useState<string>("");
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [state, setState] = useState<State>({
    assignments: [], loading: false, error: null, lastFetched: null,
  });

  // Load settings + completed from Cloud when user changes
  useEffect(() => {
    if (!user) {
      setFeedUrl("");
      setCompleted(new Set());
      setState({ assignments: [], loading: false, error: null, lastFetched: null });
      return;
    }

    (async () => {
      const [{ data: settings }, { data: comps }] = await Promise.all([
        supabase.from("user_settings").select("feed_url").eq("user_id", user.id).maybeSingle(),
        supabase.from("completed_assignments").select("assignment_id").eq("user_id", user.id),
      ]);
      setCompleted(new Set((comps || []).map((c) => c.assignment_id)));
      const url = settings?.feed_url || "";
      setFeedUrl(url);

      // Hydrate cache for instant render
      const raw = localStorage.getItem(`${CACHE_KEY}_${user.id}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setState({
            assignments: (parsed.assignments || []).map((a: any) => ({
              ...a, due: a.due ? new Date(a.due) : null,
            })),
            loading: false, error: null,
            lastFetched: parsed.lastFetched ? new Date(parsed.lastFetched) : null,
          });
        } catch {}
      }
      if (url) doRefresh(url, user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const doRefresh = async (_url: string, userId: string) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const ics = await fetchFeedViaServer();
      const parsed = parseICS(ics).map((a) => ({ ...a, due: a.due ? new Date(a.due) : null }));
      const now = new Date();
      setState({ assignments: parsed, loading: false, error: null, lastFetched: now });
      localStorage.setItem(
        `${CACHE_KEY}_${userId}`,
        JSON.stringify({ assignments: parsed, lastFetched: now })
      );
    } catch (e: any) {
      setState((s) => ({ ...s, loading: false, error: e?.message || "Failed to fetch feed" }));
    }
  };

  const refresh = useCallback(async (url?: string) => {
    if (!user) return;
    const target = url ?? feedUrl;
    if (!target) return;
    await doRefresh(target, user.id);
  }, [feedUrl, user]);

  // Auto-refresh every 15 min
  useEffect(() => {
    if (!feedUrl || !user) return;
    const id = setInterval(() => refresh(), 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [feedUrl, user, refresh]);

  // Push assignments + completed to Electron main process for notification scheduling
  useEffect(() => {
    if (!electron) return;
    electron.syncAssignments({
      assignments: state.assignments.map((a) => ({
        id: a.id,
        title: a.title,
        course: a.course,
        due: a.due ? new Date(a.due).toISOString() : null,
      })),
      completed: [...completed],
    });
  }, [state.assignments, completed]);

  const saveFeedUrl = useCallback(async (url: string) => {
    if (!user) return;
    setFeedUrl(url);
    await supabase.from("user_settings").upsert({ user_id: user.id, feed_url: url });
    if (url) doRefresh(url, user.id);
  }, [user]);

  const toggleCompleted = useCallback(async (id: string) => {
    if (!user) return;
    const isCompleted = completed.has(id);
    const next = new Set(completed);
    if (isCompleted) next.delete(id); else next.add(id);
    setCompleted(next);
    if (isCompleted) {
      await supabase.from("completed_assignments").delete()
        .eq("user_id", user.id).eq("assignment_id", id);
    } else {
      await supabase.from("completed_assignments")
        .insert({ user_id: user.id, assignment_id: id });
    }
  }, [completed, user]);

  return { ...state, feedUrl, saveFeedUrl, refresh, completed, toggleCompleted };
}
