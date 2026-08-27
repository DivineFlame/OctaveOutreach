"use client";

import type { ViewProps } from "../page";
import { Empty } from "./ui";

/** Keyed by the `action` column the API routes write, per entity type. */
const LABELS: Record<string, string> = {
  "campaign:created": "created a campaign",
  "campaign:leads_imported": "imported leads",
  "campaign:drafts_generated": "generated drafts",
  "lead:created": "added a lead",
  "lead:updated": "updated a lead",
  "lead:do_not_contact": "marked a lead Do Not Contact",
  "lead:follow_up_scheduled": "scheduled a follow-up",
  "draft:save": "edited a draft",
  "draft:approve": "approved a draft",
  "draft:saved_to_drafts": "saved a draft to the email drafts folder",
  "draft:mark_sent": "recorded a manual send",
  "draft:record_reply": "recorded a reply",
  "draft:qualify": "qualified a lead",
  "draft:hold": "held a draft",
  "draft:reopen": "reopened a draft",
  "settings:updated": "updated workspace settings",
  "session:login": "signed in",
  "session:logout": "signed out",
};

function describe(entityType: string, action: string) {
  return LABELS[`${entityType}:${action}`] ?? action.replaceAll("_", " ");
}

export default function ActivityView({ data }: ViewProps) {
  if (data.activity.length === 0) {
    return (
      <section className="page-panel">
        <Empty title="No activity yet" body="Every approval, manual send and reply is recorded here as an audit trail." />
      </section>
    );
  }
  return (
    <section className="page-panel">
      <ul className="activity-feed">
        {data.activity.map((entry) => (
          <li key={entry.id}>
            <time>{new Date(entry.createdAt).toLocaleString()}</time>
            <div>
              <strong>{entry.actor || "System"}</strong> {describe(entry.entityType, entry.action)}
              <small>{entry.entityType} · {entry.entityId.slice(0, 8)}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
