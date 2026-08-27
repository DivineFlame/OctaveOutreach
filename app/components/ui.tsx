"use client";

import { CHANNEL_META } from "@/lib/channels";
import type { Channel, DraftStatus } from "@/lib/types";

export function Status({ status }: { status: DraftStatus | string }) {
  return <span className={`status status-${status}`}>{String(status).replaceAll("_", " ")}</span>;
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const meta = CHANNEL_META[channel];
  return (
    <span className="channel-badge" title={meta?.bestFor}>
      <i>{meta?.short ?? "?"}</i>
      {meta?.label ?? channel}
    </span>
  );
}

export function Empty({ title, body, action, onAction }: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <span>◎</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && <button className="secondary-button" onClick={onAction}>{action}</button>}
    </div>
  );
}

/** Clipboard with a textarea fallback for non-secure contexts. */
export async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function daysFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
