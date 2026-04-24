import { forwardRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Save, EyeOff } from "lucide-react";
import { electron, isElectron } from "@/lib/electron";

const NOTIF_KEY = "notifications_enabled";

interface Props {
  feedUrl: string;
  onSave: (url: string) => void;
  onClose: () => void;
  hideOldOverdue: boolean;
  onToggleHideOldOverdue: (v: boolean) => void;
}

export const SettingsPanel = forwardRef<HTMLDivElement, Props>(
  ({ feedUrl, onSave, onClose, hideOldOverdue, onToggleHideOldOverdue }, ref) => {
  const [value, setValue] = useState(feedUrl);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(() => {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw === null ? true : raw === "true";
  });

  useEffect(() => {
    localStorage.setItem(NOTIF_KEY, String(notifEnabled));
    electron?.setNotificationsEnabled(notifEnabled);
  }, [notifEnabled]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="absolute inset-0 p-5 flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-base font-semibold">Settings</h2>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">
          Canvas Calendar Feed URL
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://canvas.your-school.edu/feeds/calendars/user_xxx.ics"
          rows={4}
          className="glass-inset rounded-xl p-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50 resize-none"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          In Canvas, go to <span className="text-foreground">Calendar</span> → click{" "}
          <span className="text-foreground">Calendar Feed</span> at the bottom right →
          copy the URL and paste here.
        </p>
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed glass-inset rounded-lg p-2.5">
          🔒 Your feed URL is stored in your account on Lovable Cloud and fetched
          server-side. It never leaves the trusted backend after you save it.
        </p>
      </div>

      {/* Notifications toggle */}
      <div className="glass-inset rounded-xl p-3 flex items-center gap-3">
        <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Notifications</div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            {isElectron
              ? "Banners 4h, 1h, 30 min, and at the due time"
              : "Available only in the packaged Mac app"}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={notifEnabled}
          disabled={!isElectron}
          onClick={() => setNotifEnabled((v) => !v)}
          className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-40 ${
            notifEnabled ? "bg-primary" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              notifEnabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Hide old overdue toggle */}
      <div className="glass-inset rounded-xl p-3 flex items-center gap-3">
        <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Hide old overdue</div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            Auto-hide assignments overdue by more than 24h. Canvas keeps every past
            item in the feed forever.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={hideOldOverdue}
          onClick={() => onToggleHideOldOverdue(!hideOldOverdue)}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            hideOldOverdue ? "bg-primary" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              hideOldOverdue ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <button
        onClick={() => onSave(value.trim())}
        className="mt-auto rounded-xl py-2.5 px-4 font-medium text-primary-foreground flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
      >
        <Save className="w-4 h-4" />
        Save & Refresh
      </button>
    </motion.div>
  );
}
);

SettingsPanel.displayName = "SettingsPanel";
