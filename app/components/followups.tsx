"use client";

import { useMemo, useState } from "react";
import { channelLabel, openPlatformUrl } from "@/lib/channels";
import { api, type ViewProps } from "../page";
import { ChannelBadge, Empty, formatDate } from "./ui";

export default function FollowUpsView({ data, busy, refresh, run }: ViewProps) {
  const [showAll, setShowAll] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const leadsById = useMemo(() => new Map(data.leads.map((lead) => [lead.id, lead])), [data.leads]);
  const draftsById = useMemo(() => new Map(data.drafts.map((draft) => [draft.id, draft])), [data.drafts]);

  const rows = useMemo(
    () => data.followUps.filter((item) => showAll || item.dueOn <= today).sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
    [data.followUps, showAll, today],
  );

  const patch = (id: string, status: "done" | "cancelled", label: string) =>
    run(label, async () => {
      await api("/api/followups", { method: "PATCH", body: JSON.stringify({ id, status }) });
      await refresh();
    });

  return (
    <section className="page-panel">
      <div className="filters">
        <label className="toggle-row">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          <span>Include future reminders</span>
        </label>
        <span className="filter-count">{rows.length} pending</span>
      </div>

      {rows.length === 0 ? (
        <Empty
          title="Nothing due"
          body="Marking a draft as sent schedules the next touch automatically. You can also add reminders by hand from any draft."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Due</th>
                <th>Contact</th>
                <th>Company</th>
                <th>Channel</th>
                <th>Note</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const lead = item.leadId ? leadsById.get(item.leadId) : undefined;
                const draft = item.draftId ? draftsById.get(item.draftId) : undefined;
                const url = lead ? openPlatformUrl(lead, item.channel, draft) : "";
                return (
                  <tr key={item.id} className={item.dueOn < today ? "is-overdue" : ""}>
                    <td>{formatDate(item.dueOn)}{item.dueOn < today && <span className="tag tag-danger">overdue</span>}</td>
                    <td>{lead?.contactName || "—"}</td>
                    <td>{lead?.company || "—"}</td>
                    <td><ChannelBadge channel={item.channel} /></td>
                    <td>{item.note || `Follow up on ${channelLabel(item.channel)}`}</td>
                    <td className="cell-actions">
                      {url && (
                        <a className="row-action" href={url} target="_blank" rel="noreferrer noopener">Open ↗</a>
                      )}
                      <button className="row-action" disabled={busy} onClick={() => patch(item.id, "done", "Follow-up completed")}>Done</button>
                      <button className="ghost-button" disabled={busy} onClick={() => patch(item.id, "cancelled", "Follow-up cancelled")}>Cancel</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
