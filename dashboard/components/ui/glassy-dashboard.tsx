"use client";

import { useId, useState, type CSSProperties, useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Clock3,
  Download,
  Filter,
  Search,
  Zap,
  ArrowDownToLine,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Command,
  LayoutDashboard,
  Moon,
  Sun,
  TrendingUp,
  X,
  ExternalLink,
  Mail,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Sparkles,
  Award,
  Clock,
  Send,
  Puzzle,
  FileText,
  Calendar,
  Layers,
} from "lucide-react";
import "@fontsource-variable/manrope";
import { api } from "@/lib/api";
import FollowUpModal from "@/components/FollowUpModal";

export interface GlassyDashboardProps {
  backgroundImage?: string;
  workspaceName?: string;
  panelFrost?: number;
  initialTheme?: "light" | "dark";
  onSwitchToClassic?: () => void;
}

const studioPhoto = "https://cdn.21st.dev/assets/mirror/ea/ea9270b3b7246283219ac52fa77a1213e9d1efb285d76348d3620609ba6cefa7.jpg";

const dashboardStyles = `
.gd-app {
  --gd-ink: #25201e;
  --gd-muted: #5e5149;
  --gd-line: rgb(74 49 33 / 15%);
  --gd-grid: rgb(74 49 33 / 19%);
  --gd-rim: rgb(255 253 246 / 51%);
  --gd-edge-light: rgb(255 254 247 / 84%);
  --gd-edge-shade: rgb(57 40 28 / 19%);
  --gd-gloss: rgb(255 251 242 / 45%);
  --gd-frame: rgb(247 234 219 / 23%);
  --gd-rail: rgb(241 222 206 / 58%);
  --gd-card: rgb(250 242 232 / 56%);
  --gd-card-light: rgb(255 251 245 / 45%);
  --gd-raised: rgb(255 249 243 / 85%);
  --gd-inner: rgb(255 250 245 / 42%);
  --gd-surface: #f6ece2;
  --gd-track: rgb(81 49 32 / 14%);
  --gd-primary: #1e3a8a;
  --gd-primary-ink: #fffaf5;
  --gd-pick: #fff9f3;
  --gd-pick-ink: #241b17;
  --gd-coral: #b91c1c;
  --gd-teal: #047857;
  --gd-ochre: #b45309;
  --gd-graph-ink: #40332d;
  --gd-focus: #2563eb;
  --gd-dark-shadow: 35 21 14;
  inline-size: 100%;
  min-inline-size: 0;
  flex: 1 1 100%;
  position: relative;
  isolation: isolate;
  min-block-size: 100svh;
  background: #a98d76;
  color: var(--gd-ink);
  color-scheme: light;
  font-family: "Manrope Variable", Manrope, system-ui, sans-serif;
  font-size: 13px;
  font-weight: 550;
  font-variant-numeric: tabular-nums;
}
.gd-app[data-theme="dark"] {
  --gd-ink: #fff6e9;
  --gd-muted: #d6c4b4;
  --gd-line: rgb(243 221 198 / 19%);
  --gd-grid: rgb(243 221 198 / 19%);
  --gd-rim: rgb(255 236 212 / 31%);
  --gd-edge-light: rgb(255 242 225 / 49%);
  --gd-edge-shade: rgb(11 6 5 / 30%);
  --gd-gloss: rgb(255 237 213 / 13%);
  --gd-frame: rgb(42 31 29 / 52%);
  --gd-rail: rgb(45 32 30 / 65%);
  --gd-card: rgb(47 36 34 / 62%);
  --gd-card-light: rgb(106 88 81 / 38%);
  --gd-raised: rgb(80 67 61 / 86%);
  --gd-inner: rgb(78 61 56 / 55%);
  --gd-surface: #3b302c;
  --gd-track: rgb(245 226 212 / 16%);
  --gd-primary: #60a5fa;
  --gd-primary-ink: #0f172a;
  --gd-pick: #f9eee0;
  --gd-pick-ink: #241b17;
  --gd-coral: #f87171;
  --gd-teal: #34d399;
  --gd-ochre: #fbbf24;
  --gd-graph-ink: #e7d9cd;
  --gd-focus: #93c5fd;
  --gd-dark-shadow: 10 4 3;
  background: #3b2c25;
  color-scheme: dark;
}

.gd-app *, .gd-app *::before, .gd-app *::after { box-sizing: border-box; }
.gd-app :where(button, input, select) { color: inherit; font: inherit; }
.gd-app :where(button, a, input, select):focus-visible { outline: 2px solid var(--gd-focus); outline-offset: 3px; }
.gd-app a { color: inherit; text-decoration: none; }
.gd-app button { cursor: pointer; }
.gd-app :where(h1, h2, h3, p, figure) { margin: 0; }
.gd-app svg { flex: none; }
.gd-sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.gd-background, .gd-app::before {
  position: fixed;
  z-index: -2;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
  pointer-events: none;
}
.gd-background {
  object-fit: cover;
  object-position: center 60%;
  filter: sepia(.22) saturate(.78) brightness(.86);
}
.gd-app::before {
  content: "";
  z-index: -1;
  background: linear-gradient(116deg, rgb(73 48 37 / 35%), transparent 43%, rgb(162 101 63 / 24%) 76%, transparent 100%),
    linear-gradient(0deg, rgb(53 33 25 / 34%), transparent 58%);
}
.gd-app[data-theme="dark"] .gd-background { filter: sepia(.15) saturate(.75) brightness(.61); }

.gd-surround {
  inline-size: min(calc(100% - 48px), 1360px);
  margin-inline: auto;
  padding-block: 20px 32px;
}
.gd-top, .gd-dock {
  border: 1px solid var(--gd-rim);
  background: linear-gradient(165deg, var(--gd-gloss), transparent 32% 73%, var(--gd-gloss)), var(--gd-rail);
  box-shadow: inset 1px 1px 1px var(--gd-edge-light), inset -1px -1px 1px var(--gd-edge-shade),
    inset 0 -2px 5px var(--gd-gloss), 0 7px 20px rgb(var(--gd-dark-shadow) / 17%);
  backdrop-filter: blur(16px) saturate(1.35);
  -webkit-backdrop-filter: blur(16px) saturate(1.35);
}
.gd-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-block-size: 60px;
  border-radius: 999px;
  padding: 6px 14px;
  margin-bottom: 20px;
}
.gd-brand { display: flex; align-items: center; gap: 10px; min-inline-size: 0; }
.gd-logo {
  inline-size: 36px; block-size: 36px; display: grid; place-items: center;
  border-radius: 50%; background: var(--gd-primary); color: #fff;
  box-shadow: inset 0 0 0 1px var(--gd-gloss), 0 2px 7px rgb(var(--gd-dark-shadow) / 16%);
}
.gd-brand-text { display: flex; flex-direction: column; }
.gd-brand-title { font-weight: 700; font-size: 14px; letter-spacing: -0.02em; line-height: 1.15; }
.gd-brand-sub { font-size: 11px; color: var(--gd-muted); }

.gd-views {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--gd-card);
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--gd-line);
}
.gd-view-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--gd-muted);
  font-weight: 600;
  font-size: 12px;
  transition: all 0.2s ease;
}
.gd-view-btn:hover { color: var(--gd-ink); background: var(--gd-card-light); }
.gd-view-btn[aria-pressed="true"] {
  background: var(--gd-raised);
  color: var(--gd-ink);
  box-shadow: 0 2px 8px rgb(var(--gd-dark-shadow) / 12%);
}

.gd-top-actions { display: flex; align-items: center; gap: 8px; }
.gd-icon-btn {
  inline-size: 36px; block-size: 36px; display: grid; place-items: center;
  border-radius: 50%; border: 1px solid var(--gd-line); background: var(--gd-card);
  color: var(--gd-ink); transition: all 0.2s;
}
.gd-icon-btn:hover { background: var(--gd-raised); }

.gd-plate {
  border: 1px solid var(--gd-rim);
  background: linear-gradient(165deg, var(--gd-gloss), transparent 30% 70%, var(--gd-gloss)), var(--gd-rail);
  box-shadow: inset 1px 1px 1px var(--gd-edge-light), inset -1px -1px 1px var(--gd-edge-shade),
    0 12px 35px rgb(var(--gd-dark-shadow) / 22%);
  backdrop-filter: blur(var(--gd-frost, 16px)) saturate(1.3);
  -webkit-backdrop-filter: blur(var(--gd-frost, 16px)) saturate(1.3);
  border-radius: 28px;
  padding: 24px;
  min-height: 600px;
}

/* Metric Cards */
.gd-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.gd-kpi-card {
  border: 1px solid var(--gd-line);
  background: var(--gd-card);
  border-radius: 20px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: inset 0 1px 0 var(--gd-gloss), 0 4px 14px rgb(var(--gd-dark-shadow) / 8%);
  transition: transform 0.2s, box-shadow 0.2s;
}
.gd-kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: inset 0 1px 0 var(--gd-gloss), 0 8px 24px rgb(var(--gd-dark-shadow) / 14%);
}
.gd-kpi-head { display: flex; justify-content: space-between; align-items: center; color: var(--gd-muted); margin-bottom: 12px; }
.gd-kpi-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.gd-kpi-icon {
  inline-size: 32px; block-size: 32px; border-radius: 10px; display: grid; place-items: center;
  background: var(--gd-raised); border: 1px solid var(--gd-line);
}
.gd-kpi-val { font-size: 32px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; color: var(--gd-ink); margin-bottom: 6px; }
.gd-kpi-sub { font-size: 11px; color: var(--gd-muted); display: flex; align-items: center; gap: 4px; }

/* Section Cards & Tables */
.gd-section {
  border: 1px solid var(--gd-line);
  background: var(--gd-card);
  border-radius: 22px;
  padding: 22px;
  margin-bottom: 20px;
  box-shadow: inset 0 1px 0 var(--gd-gloss), 0 4px 16px rgb(var(--gd-dark-shadow) / 8%);
}
.gd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.gd-section-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }

/* Filter Tabs */
.gd-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.gd-filter-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.gd-chip {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--gd-line);
  background: var(--gd-card);
  color: var(--gd-muted);
  transition: all 0.15s;
}
.gd-chip:hover { color: var(--gd-ink); background: var(--gd-card-light); }
.gd-chip[data-active="true"] {
  background: var(--gd-primary);
  color: var(--gd-primary-ink);
  border-color: transparent;
}

/* Glassy Table */
.gd-table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid var(--gd-line); }
.gd-table { width: 100%; border-collapse: collapse; text-align: left; }
.gd-table th {
  padding: 12px 16px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gd-muted);
  background: var(--gd-raised);
  border-bottom: 1px solid var(--gd-line);
}
.gd-table td {
  padding: 14px 16px;
  font-size: 12px;
  border-bottom: 1px solid var(--gd-line);
  background: var(--gd-card-light);
  color: var(--gd-ink);
}
.gd-table tr:hover td { background: var(--gd-raised); }

/* Badges */
.gd-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid var(--gd-line);
}
.gd-badge-dot { inline-size: 6px; block-size: 6px; border-radius: 50%; }

/* Buttons */
.gd-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  background: var(--gd-primary);
  color: var(--gd-primary-ink);
  font-weight: 600;
  font-size: 12px;
  border: none;
  box-shadow: 0 2px 8px rgb(var(--gd-dark-shadow) / 16%);
  transition: all 0.2s;
}
.gd-btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
.gd-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 12px;
  background: var(--gd-raised);
  color: var(--gd-ink);
  font-weight: 600;
  font-size: 12px;
  border: 1px solid var(--gd-line);
  transition: all 0.2s;
}
.gd-btn-secondary:hover { background: var(--gd-card); }

/* Pipeline Bar */
.gd-pipe-bar { height: 8px; border-radius: 999px; background: var(--gd-track); overflow: hidden; margin-top: 6px; }
.gd-pipe-fill { height: 100%; border-radius: 999px; background: var(--gd-primary); transition: width 0.4s ease; }

/* Dialog */
.gd-modal-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgb(0 0 0 / 50%);
  backdrop-filter: blur(8px);
  display: grid; place-items: center; padding: 20px;
}
.gd-modal {
  width: min(100%, 600px);
  border-radius: 24px;
  border: 1px solid var(--gd-rim);
  background: var(--gd-surface);
  color: var(--gd-ink);
  box-shadow: 0 20px 40px rgb(0 0 0 / 40%);
  padding: 24px;
}
`;

export default function GlassyDashboard({
  backgroundImage = studioPhoto,
  workspaceName = "ApplyRecall",
  panelFrost = 16,
  initialTheme = "light",
  onSwitchToClassic,
}: GlassyDashboardProps) {
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);
  const [activeView, setActiveView] = useState<"overview" | "applications" | "reminders" | "surfaces">("overview");
  const [frost, setFrost] = useState(panelFrost);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Real ApplyRecall API Data
  const [summary, setSummary] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Inspection State
  const [inspectedApp, setInspectedApp] = useState<any>(null);
  const [followupApp, setFollowupApp] = useState<any>(null);

  // Pairing code state
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingCopied, setPairingCopied] = useState(false);

  // Notification toast
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumRes, appsRes, remsRes, actRes] = await Promise.all([
        api.getSummary().catch(() => null),
        api.getApplications({ sort: "newest" }).catch(() => []),
        api.getReminders({ tab: "today" }).catch(() => []),
        api.getActivity().catch(() => []),
      ]);
      setSummary(sumRes);
      setApplications(appsRes || []);
      setReminders(remsRes || []);
      setActivity(actRes || []);
    } catch (e) {
      console.error("ApplyRecall Glassy Dashboard error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Keyboard shortcut Cmd/Ctrl + K for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Generate pairing code
  const handleGeneratePairingCode = async () => {
    try {
      setPairingLoading(true);
      const res = await api.generatePairingCode("extension");
      setPairingCode(res.code || "PAIRME");
      showToast("Generated new pairing code. Valid for 15 minutes.");
    } catch (e: any) {
      showToast(e.message || "Failed to generate pairing code.");
    } finally {
      setPairingLoading(false);
    }
  };

  // Snooze reminder
  const handleSnooze = async (reminderId: string, days = 1) => {
    try {
      await api.snoozeReminder(reminderId, days);
      showToast(`Reminder snoozed for ${days} day(s).`);
      const updated = await api.getReminders({ tab: "today" });
      setReminders(updated);
    } catch {
      showToast("Failed to snooze reminder.");
    }
  };

  // Export applications to CSV
  const handleExportCsv = () => {
    if (!applications.length) {
      showToast("No applications to export.");
      return;
    }
    const headers = ["Company", "Position", "Status", "Applied Date", "Location", "Notes", "Job URL"];
    const rows = applications.map((a) => [
      `"${(a.company || "").replace(/"/g, '""')}"`,
      `"${(a.position || "").replace(/"/g, '""')}"`,
      `"${(a.status || "").replace(/"/g, '""')}"`,
      `"${(a.applied_at || a.created_at || "").substring(0, 10)}"`,
      `"${(a.location || "").replace(/"/g, '""')}"`,
      `"${(a.notes || "").replace(/"/g, '""')}"`,
      `"${(a.job_url || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `applyrecall_applications_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloaded applications CSV.");
  };

  // Status Colors & Badge Helpers
  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s.includes("offer")) return { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", dot: "#10b981" };
    if (s.includes("interview")) return { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", dot: "#f59e0b" };
    if (s.includes("applied") || s.includes("assessment")) return { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", dot: "#3b82f6" };
    if (s.includes("rejected")) return { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", dot: "#ef4444" };
    return { bg: "rgba(156, 163, 175, 0.15)", text: "#9ca3af", dot: "#9ca3af" };
  };

  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      !searchQuery ||
      app.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.position?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" || app.status?.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="gd-app" data-theme={theme} style={{ "--gd-frost": `${frost}px` } as CSSProperties}>
      <style>{dashboardStyles}</style>

      {/* Atmospheric Background Scene */}
      <img src={backgroundImage} alt="" className="gd-background" aria-hidden="true" />

      {/* Floating Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 9999,
          background: "var(--gd-surface)",
          color: "var(--gd-ink)",
          padding: "10px 18px",
          borderRadius: "999px",
          border: "1px solid var(--gd-rim)",
          boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
          fontSize: "12px",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <CheckCircle2 size={16} color="var(--gd-teal)" />
          <span>{toast}</span>
        </div>
      )}

      <div className="gd-surround">
        {/* Top Control Bar */}
        <header className="gd-top">
          <div className="gd-brand">
            <div className="gd-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div className="gd-brand-text">
              <span className="gd-brand-title">{workspaceName}</span>
              <span className="gd-brand-sub">Spatial Intelligence</span>
            </div>
          </div>

          {/* Navigation View Tabs */}
          <nav className="gd-views" aria-label="Views">
            <button
              type="button"
              className="gd-view-btn"
              aria-pressed={activeView === "overview"}
              onClick={() => setActiveView("overview")}
            >
              <LayoutDashboard size={14} />
              <span>Overview</span>
            </button>
            <button
              type="button"
              className="gd-view-btn"
              aria-pressed={activeView === "applications"}
              onClick={() => setActiveView("applications")}
            >
              <BriefcaseBusiness size={14} />
              <span>Applications ({applications.length})</span>
            </button>
            <button
              type="button"
              className="gd-view-btn"
              aria-pressed={activeView === "reminders"}
              onClick={() => setActiveView("reminders")}
            >
              <Clock3 size={14} />
              <span>Radar ({reminders.length})</span>
            </button>
            <button
              type="button"
              className="gd-view-btn"
              aria-pressed={activeView === "surfaces"}
              onClick={() => setActiveView("surfaces")}
            >
              <Zap size={14} />
              <span>Surfaces</span>
            </button>
          </nav>

          {/* Top Actions */}
          <div className="gd-top-actions">
            <button
              type="button"
              className="gd-icon-btn"
              title="Quick Search (Cmd+K)"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={15} />
            </button>
            <button
              type="button"
              className="gd-icon-btn"
              title="Toggle Light/Dark Theme"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button
              type="button"
              className="gd-icon-btn"
              title="Export Applications CSV"
              onClick={handleExportCsv}
            >
              <Download size={15} />
            </button>
            {onSwitchToClassic && (
              <button
                type="button"
                className="gd-btn-secondary"
                onClick={onSwitchToClassic}
                style={{ height: "36px", padding: "0 12px", borderRadius: "999px" }}
              >
                <Layers size={13} />
                <span>Classic View</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Glass Panel */}
        <main className="gd-plate">
          {/* 4 Metric Cards */}
          <section className="gd-kpi-grid">
            {/* Total Tracked */}
            <div className="gd-kpi-card">
              <div className="gd-kpi-head">
                <span className="gd-kpi-title">Total Tracked</span>
                <div className="gd-kpi-icon"><BriefcaseBusiness size={16} /></div>
              </div>
              <div className="gd-kpi-val">{loading ? "—" : summary?.total_applications ?? applications.length}</div>
              <div className="gd-kpi-sub">
                <TrendingUp size={12} color="var(--gd-teal)" />
                <span>Active job opportunities</span>
              </div>
            </div>

            {/* Awaiting Response */}
            <div className="gd-kpi-card">
              <div className="gd-kpi-head">
                <span className="gd-kpi-title">Awaiting Response</span>
                <div className="gd-kpi-icon"><Clock size={16} /></div>
              </div>
              <div className="gd-kpi-val">{loading ? "—" : summary?.awaiting_response ?? 0}</div>
              <div className="gd-kpi-sub">
                <Sparkles size={12} color="var(--gd-ochre)" />
                <span>Submitted applications</span>
              </div>
            </div>

            {/* Interviews */}
            <div className="gd-kpi-card">
              <div className="gd-kpi-head">
                <span className="gd-kpi-title">Interviews</span>
                <div className="gd-kpi-icon"><Award size={16} /></div>
              </div>
              <div className="gd-kpi-val" style={{ color: "var(--gd-ochre)" }}>
                {loading ? "—" : summary?.interviews ?? 0}
              </div>
              <div className="gd-kpi-sub">
                <span>In technical & behavioral loops</span>
              </div>
            </div>

            {/* Follow-ups Due */}
            <div className="gd-kpi-card">
              <div className="gd-kpi-head">
                <span className="gd-kpi-title">Follow-ups Due</span>
                <div className="gd-kpi-icon"><AlertCircle size={16} /></div>
              </div>
              <div className="gd-kpi-val" style={{ color: summary?.follow_ups_due > 0 ? "var(--gd-coral)" : "inherit" }}>
                {loading ? "—" : summary?.follow_ups_due ?? reminders.length}
              </div>
              <div className="gd-kpi-sub">
                <span>{summary?.follow_ups_due > 0 ? "Action suggested today" : "All up to date"}</span>
              </div>
            </div>
          </section>

          {/* VIEW 1: OVERVIEW & TELEMETRY */}
          {activeView === "overview" && (
            <div className="space-y-6">
              {/* Next Actions & Radar Hero Card */}
              <div className="gd-section">
                <div className="gd-section-head">
                  <div className="gd-section-title">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gd-primary)" }} />
                    <span>Follow-up Radar & Next Actions</span>
                  </div>
                  <button
                    type="button"
                    className="gd-btn-secondary"
                    onClick={() => setActiveView("reminders")}
                  >
                    <span>View all ({reminders.length})</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                {reminders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--gd-muted)" }}>
                    <CheckCircle2 size={28} color="var(--gd-teal)" style={{ margin: "0 auto 8px" }} />
                    <p style={{ fontWeight: 600, color: "var(--gd-ink)" }}>Nothing needs your attention right now.</p>
                    <p style={{ fontSize: 11, marginTop: 4 }}>
                      When you submit an application, ApplyRecall automatically suggests follow-ups when due.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {reminders.slice(0, 3).map((rem) => (
                      <div
                        key={rem.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderRadius: 14,
                          background: "var(--gd-raised)",
                          border: "1px solid var(--gd-line)",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{rem.company}</span>
                            <span style={{ color: "var(--gd-muted)", fontSize: 11 }}>({rem.position})</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--gd-coral)", fontWeight: 600 }}>
                            Follow-up suggested • Due today
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="gd-btn-primary"
                            onClick={() => setFollowupApp({ id: rem.application_id, company: rem.company, position: rem.position })}
                          >
                            <Mail size={13} />
                            <span>Draft Email</span>
                          </button>
                          <button
                            type="button"
                            className="gd-btn-secondary"
                            onClick={() => handleSnooze(rem.id, 1)}
                          >
                            <span>Snooze 1d</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grid: Recent Applications & Pipeline Distribution */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
                {/* Recent Applications Stream */}
                <div className="gd-section" style={{ margin: 0 }}>
                  <div className="gd-section-head">
                    <span className="gd-section-title">Recent Applications</span>
                    <button
                      type="button"
                      className="gd-btn-secondary"
                      onClick={() => setActiveView("applications")}
                    >
                      <span>Explore all</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>

                  {applications.length === 0 ? (
                    <p style={{ color: "var(--gd-muted)", padding: "16px 0", fontSize: 12 }}>
                      No applications recorded yet. Pair your Chrome extension to save jobs automatically!
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {applications.slice(0, 5).map((app) => {
                        const badge = getStatusBadge(app.status);
                        return (
                          <div
                            key={app.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              borderRadius: 12,
                              background: "var(--gd-raised)",
                              border: "1px solid var(--gd-line)",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 700, fontSize: 13 }}>{app.company}</span>
                                <span
                                  className="gd-badge"
                                  style={{ background: badge.bg, color: badge.text, borderColor: "transparent" }}
                                >
                                  <span className="gd-badge-dot" style={{ background: badge.dot }} />
                                  {app.status || "Saved"}
                                </span>
                              </div>
                              <span style={{ fontSize: 11, color: "var(--gd-muted)" }}>
                                {app.position} • {app.applied_at ? `Applied ${app.applied_at.substring(0, 10)}` : "Draft"}
                              </span>
                            </div>

                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                className="gd-btn-secondary"
                                onClick={() => setInspectedApp(app)}
                                style={{ padding: "4px 8px", fontSize: 11 }}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                className="gd-btn-secondary"
                                onClick={() => setFollowupApp(app)}
                                style={{ padding: "4px 8px", fontSize: 11 }}
                              >
                                Follow-up
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pipeline Distribution */}
                <div className="gd-section" style={{ margin: 0 }}>
                  <div className="gd-section-head">
                    <span className="gd-section-title">Pipeline Funnel</span>
                    <span style={{ fontSize: 11, color: "var(--gd-muted)" }}>Conversion metrics</span>
                  </div>

                  {summary?.pipeline ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      {Object.entries(summary.pipeline as Record<string, number>).map(([statusName, count]) => {
                        const total = summary?.total_applications || applications.length || 1;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <div key={statusName}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600 }}>{statusName}</span>
                              <span style={{ color: "var(--gd-muted)" }}>
                                {count} ({pct}%)
                              </span>
                            </div>
                            <div className="gd-pipe-bar">
                              <div className="gd-pipe-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p style={{ color: "var(--gd-muted)", fontSize: 12 }}>Loading pipeline analytics...</p>
                  )}
                </div>
              </div>

              {/* Activity Log */}
              <div className="gd-section">
                <div className="gd-section-head">
                  <span className="gd-section-title">Application Memory Activity</span>
                  <span style={{ fontSize: 11, color: "var(--gd-muted)" }}>Recent events</span>
                </div>

                {activity.length === 0 ? (
                  <p style={{ color: "var(--gd-muted)", fontSize: 12 }}>No activity recorded yet.</p>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {activity.slice(0, 6).map((ev) => (
                      <div
                        key={ev.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}
                      >
                        <div style={{ inlineSize: 6, blockSize: 6, borderRadius: "50%", background: "var(--gd-primary)" }} />
                        <span style={{ fontWeight: 600 }}>{ev.company}</span>
                        <span style={{ color: "var(--gd-muted)" }}>— {ev.description}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--gd-muted)", fontFamily: "monospace" }}>
                          {ev.created_at ? ev.created_at.substring(0, 16).replace("T", " ") : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 2: APPLICATIONS STREAM */}
          {activeView === "applications" && (
            <div>
              {/* Filter & Search Bar */}
              <div className="gd-filter-bar">
                <div className="gd-filter-chips">
                  {["All", "Saved", "Applied", "Assessment", "Interview", "Offer", "Rejected"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="gd-chip"
                      data-active={statusFilter === st}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Search company or role..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "999px",
                      border: "1px solid var(--gd-line)",
                      background: "var(--gd-raised)",
                      fontSize: 12,
                      minWidth: 200,
                    }}
                  />
                  <button type="button" className="gd-btn-secondary" onClick={handleExportCsv}>
                    <Download size={13} />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Glass Table */}
              <div className="gd-table-wrap">
                <table className="gd-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role / Position</th>
                      <th>Status</th>
                      <th>Applied Date</th>
                      <th>Location</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplications.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--gd-muted)" }}>
                          No applications match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredApplications.map((app) => {
                        const badge = getStatusBadge(app.status);
                        return (
                          <tr key={app.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  inlineSize: 28, blockSize: 28, borderRadius: 8,
                                  background: "var(--gd-raised)", border: "1px solid var(--gd-line)",
                                  display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11
                                }}>
                                  {app.company ? app.company[0].toUpperCase() : "A"}
                                </div>
                                <span style={{ fontWeight: 700 }}>{app.company}</span>
                              </div>
                            </td>
                            <td>{app.position || "Candidate"}</td>
                            <td>
                              <span className="gd-badge" style={{ background: badge.bg, color: badge.text, borderColor: "transparent" }}>
                                <span className="gd-badge-dot" style={{ background: badge.dot }} />
                                {app.status || "Saved"}
                              </span>
                            </td>
                            <td style={{ color: "var(--gd-muted)" }}>
                              {app.applied_at ? app.applied_at.substring(0, 10) : "Draft"}
                            </td>
                            <td style={{ color: "var(--gd-muted)" }}>{app.location || "Remote / Hybrid"}</td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: 6 }}>
                                <button
                                  type="button"
                                  className="gd-btn-secondary"
                                  onClick={() => setInspectedApp(app)}
                                  style={{ padding: "4px 8px", fontSize: 11 }}
                                >
                                  Details
                                </button>
                                <button
                                  type="button"
                                  className="gd-btn-primary"
                                  onClick={() => setFollowupApp(app)}
                                  style={{ padding: "4px 8px", fontSize: 11 }}
                                >
                                  Follow-up
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 3: RADAR & REMINDERS */}
          {activeView === "reminders" && (
            <div className="space-y-6">
              <div className="gd-section">
                <div className="gd-section-head">
                  <div className="gd-section-title">
                    <Clock3 size={16} />
                    <span>Active Follow-up Queue</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--gd-muted)" }}>
                    Automated memory for timely responses
                  </span>
                </div>

                {reminders.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--gd-muted)" }}>
                    <CheckCircle2 size={36} color="var(--gd-teal)" style={{ margin: "0 auto 12px" }} />
                    <p style={{ fontWeight: 700, fontSize: 15, color: "var(--gd-ink)" }}>You're all caught up!</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>
                      No follow-ups due right now. ApplyRecall monitors submitted applications and flags them when review is due.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {reminders.map((rem) => (
                      <div
                        key={rem.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "16px 20px",
                          borderRadius: 16,
                          background: "var(--gd-raised)",
                          border: "1px solid var(--gd-line)",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontWeight: 800, fontSize: 14 }}>{rem.company}</span>
                            <span style={{ color: "var(--gd-muted)", fontSize: 12 }}>({rem.position})</span>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--gd-coral)", fontWeight: 700 }}>
                            Follow-up suggested • Action due today
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="gd-btn-primary"
                            onClick={() => setFollowupApp({ id: rem.application_id, company: rem.company, position: rem.position })}
                          >
                            <Mail size={13} />
                            <span>Draft Follow-up Email</span>
                          </button>
                          <button
                            type="button"
                            className="gd-btn-secondary"
                            onClick={() => handleSnooze(rem.id, 1)}
                          >
                            <span>Snooze 1d</span>
                          </button>
                          <button
                            type="button"
                            className="gd-btn-secondary"
                            onClick={() => handleSnooze(rem.id, 3)}
                          >
                            <span>Snooze 3d</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 4: CONNECTED SURFACES */}
          {activeView === "surfaces" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
              {/* Chrome Extension Surface */}
              <div className="gd-section">
                <div className="gd-section-head">
                  <div className="gd-section-title">
                    <Puzzle size={16} color="var(--gd-primary)" />
                    <span>Chrome Extension</span>
                  </div>
                  <span
                    className="gd-badge"
                    style={{
                      background: summary?.extension_connected ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
                      color: summary?.extension_connected ? "#10b981" : "var(--gd-muted)",
                      borderColor: "transparent",
                    }}
                  >
                    <span
                      className="gd-badge-dot"
                      style={{ background: summary?.extension_connected ? "#10b981" : "#9ca3af" }}
                    />
                    {summary?.extension_connected ? "Active & Linked" : "Ready to Link"}
                  </span>
                </div>

                <p style={{ fontSize: 12, color: "var(--gd-muted)", marginBottom: 16 }}>
                  Autofills repetitive application fields, remembers your past approved answers, and automatically captures job listings from LinkedIn, Greenhouse, Lever, and Workday.
                </p>

                {pairingCode ? (
                  <div style={{
                    padding: "16px",
                    borderRadius: 14,
                    background: "var(--gd-raised)",
                    border: "1px dashed var(--gd-line)",
                    textAlign: "center",
                    marginBottom: 16,
                  }}>
                    <span style={{ fontSize: 11, color: "var(--gd-muted)", display: "block", marginBottom: 6 }}>
                      TEMPORARY PAIRING CODE (15 MINS)
                    </span>
                    <div style={{
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: "0.2em",
                      color: "var(--gd-ink)",
                      marginBottom: 10,
                    }}>
                      {pairingCode}
                    </div>
                    <button
                      type="button"
                      className="gd-btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(pairingCode);
                        setPairingCopied(true);
                        setTimeout(() => setPairingCopied(false), 2000);
                      }}
                    >
                      {pairingCopied ? <Check size={13} color="var(--gd-teal)" /> : <Copy size={13} />}
                      <span>{pairingCopied ? "Copied Code" : "Copy Code"}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="gd-btn-primary"
                    disabled={pairingLoading}
                    onClick={handleGeneratePairingCode}
                    style={{ marginBottom: 16 }}
                  >
                    <Zap size={14} />
                    <span>{pairingLoading ? "Generating..." : "Generate Extension Pairing Code"}</span>
                  </button>
                )}

                <div style={{ fontSize: 11, color: "var(--gd-muted)" }}>
                  Enter this 6-character code into the ApplyRecall extension popup in Chrome to pair instantly.
                </div>
              </div>

              {/* Telegram Assistant Surface */}
              <div className="gd-section">
                <div className="gd-section-head">
                  <div className="gd-section-title">
                    <Send size={16} color="var(--gd-primary)" />
                    <span>Telegram Assistant</span>
                  </div>
                  <span
                    className="gd-badge"
                    style={{
                      background: summary?.telegram_connected ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
                      color: summary?.telegram_connected ? "#10b981" : "var(--gd-muted)",
                      borderColor: "transparent",
                    }}
                  >
                    <span
                      className="gd-badge-dot"
                      style={{ background: summary?.telegram_connected ? "#10b981" : "#9ca3af" }}
                    />
                    {summary?.telegram_connected ? "Active" : "Unlinked"}
                  </span>
                </div>

                <p style={{ fontSize: 12, color: "var(--gd-muted)", marginBottom: 16 }}>
                  Query your application history on the go, receive follow-up push alerts on your phone, and manage follow-ups directly via chat.
                </p>

                <div style={{
                  padding: "14px",
                  borderRadius: 14,
                  background: "var(--gd-raised)",
                  border: "1px solid var(--gd-line)",
                  fontSize: 12,
                }}>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>How to connect:</p>
                  <ol style={{ paddingLeft: 18, margin: 0, color: "var(--gd-muted)", display: "grid", gap: 4 }}>
                    <li>Open <code>@ApplyRecallBot</code> on Telegram</li>
                    <li>Generate a code in Dashboard &gt; Settings</li>
                    <li>Send: <code>/link &lt;YOUR_CODE&gt;</code></li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* QUICK ACTIONS / CMD+K SEARCH DIALOG */}
      {searchOpen && (
        <div className="gd-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="gd-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Command size={16} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Quick Actions & Search</span>
              </div>
              <button type="button" className="gd-icon-btn" onClick={() => setSearchOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <input
              type="text"
              autoFocus
              placeholder="Search companies, roles, or jump to view..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 14,
                border: "1px solid var(--gd-line)",
                background: "var(--gd-raised)",
                fontSize: 13,
                marginBottom: 16,
              }}
            />

            <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
              {filteredApplications.slice(0, 5).map((app) => (
                <button
                  type="button"
                  key={app.id}
                  onClick={() => {
                    setInspectedApp(app);
                    setSearchOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--gd-raised)",
                    border: "1px solid var(--gd-line)",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{app.company}</strong>
                    <div style={{ fontSize: 11, color: "var(--gd-muted)" }}>{app.position}</div>
                  </div>
                  <ChevronRight size={14} color="var(--gd-muted)" />
                </button>
              ))}

              {filteredApplications.length === 0 && (
                <p style={{ textAlign: "center", color: "var(--gd-muted)", padding: "16px 0", fontSize: 12 }}>
                  No matching applications found.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT APPLICATION DIALOG */}
      {inspectedApp && (
        <div className="gd-modal-backdrop" onClick={() => setInspectedApp(null)}>
          <div className="gd-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>{inspectedApp.company}</h3>
                <span style={{ fontSize: 12, color: "var(--gd-muted)" }}>{inspectedApp.position}</span>
              </div>
              <button type="button" className="gd-icon-btn" onClick={() => setInspectedApp(null)}>
                <X size={15} />
              </button>
            </div>

            <div style={{ display: "grid", gap: 12, margin: "16px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--gd-raised)", borderRadius: 10 }}>
                <span style={{ color: "var(--gd-muted)", fontSize: 11 }}>Status</span>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{inspectedApp.status}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--gd-raised)", borderRadius: 10 }}>
                <span style={{ color: "var(--gd-muted)", fontSize: 11 }}>Date Applied</span>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{inspectedApp.applied_at?.substring(0, 10) || "Draft"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--gd-raised)", borderRadius: 10 }}>
                <span style={{ color: "var(--gd-muted)", fontSize: 11 }}>Location</span>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{inspectedApp.location || "Remote / Hybrid"}</span>
              </div>
              {inspectedApp.job_url && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "var(--gd-raised)", borderRadius: 10 }}>
                  <span style={{ color: "var(--gd-muted)", fontSize: 11 }}>Job Posting</span>
                  <a
                    href={inspectedApp.job_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--gd-primary)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                  >
                    <span>Open link</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                className="gd-btn-secondary"
                onClick={() => setInspectedApp(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="gd-btn-primary"
                onClick={() => {
                  const target = inspectedApp;
                  setInspectedApp(null);
                  setFollowupApp(target);
                }}
              >
                <Mail size={13} />
                <span>Draft Follow-up Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOLLOW-UP EMAIL COMPOSER MODAL */}
      {followupApp && (
        <FollowUpModal
          application={followupApp}
          onClose={() => setFollowupApp(null)}
        />
      )}
    </div>
  );
}

export { GlassyDashboard };
