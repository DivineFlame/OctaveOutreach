"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, type WorkspaceData } from "@/lib/types";
import ActivityView from "./components/activity";
import CampaignsView from "./components/campaigns";
import FollowUpsView from "./components/followups";
import InboxView from "./components/inbox";
import LeadsView from "./components/leads";
import SettingsView from "./components/settings";

export interface WorkspacePayload extends WorkspaceData {
  session: { username: string; displayName: string; role: string; workspaceName: string };
  provider: string;
}

const EMPTY: WorkspacePayload = {
  campaigns: [],
  leads: [],
  drafts: [],
  followUps: [],
  activity: [],
  settings: DEFAULT_SETTINGS,
  session: { username: "", displayName: "", role: "", workspaceName: "" },
  provider: "",
};

export type View = "campaigns" | "inbox" | "leads" | "followups" | "activity" | "settings";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "content-type": "application/json", ...init?.headers },
  });
  if (response.status === 401) {
    // A hard navigation, not router.push — the whole client tree must be torn
    // down so no workspace data survives an expired session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error ?? "Request failed");
  return result as T;
}

/** Props every view receives. `run` centralises the busy flag and error banner. */
export interface ViewProps {
  data: WorkspacePayload;
  busy: boolean;
  refresh: () => Promise<void>;
  run: <T>(label: string, fn: () => Promise<T>) => Promise<T | null>;
  flash: (message: string) => void;
  go: (view: View) => void;
}

export default function Home() {
  const [view, setView] = useState<View>("inbox");
  const [data, setData] = useState<WorkspacePayload>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const flash = useCallback((message: string) => {
    setError("");
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4000);
  }, []);

  const refresh = useCallback(async () => {
    const payload = await api<WorkspacePayload>("/api/workspace");
    setData(payload);
  }, []);

  // Initial load. Every state update happens after the await, so an unmount
  // mid-flight cannot set state on a dead component.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = await api<WorkspacePayload>("/api/workspace");
        if (active) setData(payload);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load workspace");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const run = useCallback<ViewProps["run"]>(
    async (label, fn) => {
      setBusy(true);
      setError("");
      try {
        const result = await fn();
        if (label) flash(label);
        return result;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Something went wrong");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  const counts = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return {
      campaigns: data.campaigns.length,
      inbox: data.drafts.filter((draft) =>
        ["needs_review", "approved", "ready", "waiting_consent"].includes(draft.status),
      ).length,
      leads: data.leads.length,
      followups: data.followUps.filter((item) => item.status === "pending" && item.dueOn <= today).length,
    };
  }, [data]);

  const nav: { id: View; label: string; hint: string; count?: number }[] = [
    { id: "inbox", label: "Draft inbox", hint: "Review, approve and send", count: counts.inbox },
    { id: "leads", label: "Leads", hint: "Research and import", count: counts.leads },
    { id: "followups", label: "Follow-ups", hint: "Due reminders", count: counts.followups },
    { id: "campaigns", label: "Campaigns", hint: "Analyse and plan", count: counts.campaigns },
    { id: "activity", label: "Activity", hint: "Audit trail" },
    { id: "settings", label: "Settings", hint: "Sender and collateral" },
  ];

  const shared: ViewProps = { data, busy, refresh, run, flash, go: setView };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">OO</div>
          <div>
            <strong>Octave Outreach</strong>
            <small>{data.session.workspaceName || "Workspace"}</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item${view === item.id ? " is-active" : ""}`}
              onClick={() => setView(item.id)}
            >
              <span>
                {item.label}
                <small>{item.hint}</small>
              </span>
              {item.count ? <b>{item.count}</b> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="policy-note">
            Every channel stops at <strong>copy &amp; send manually</strong>. Nothing is posted or messaged for you.
          </p>
          <small>Drafting: {data.provider || "—"}</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{data.session.displayName || data.session.username || "Signed in"} · {data.session.role || "—"}</p>
            <h1>{nav.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="top-actions">
            <span className="safe-mode">Manual send mode</span>
            <button className="logout-button" onClick={() => run("", async () => {
              await api("/api/auth/logout", { method: "POST" });
              // Hard navigation so the signed-out workspace cannot be read back.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.href = "/login";
            })}>
              Sign out
            </button>
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}

        {loading ? (
          <div className="loading-card">Loading workspace…</div>
        ) : view === "inbox" ? (
          <InboxView {...shared} />
        ) : view === "leads" ? (
          <LeadsView {...shared} />
        ) : view === "followups" ? (
          <FollowUpsView {...shared} />
        ) : view === "campaigns" ? (
          <CampaignsView {...shared} />
        ) : view === "activity" ? (
          <ActivityView {...shared} />
        ) : (
          <SettingsView {...shared} />
        )}
      </main>
    </div>
  );
}
