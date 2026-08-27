"use client";

import { useMemo, useState } from "react";
import {
  CHANNELS_BY_PRIORITY,
  CHANNEL_META,
  channelGate,
  draftTypeLabel,
  openPlatformUrl,
  type MailClient,
} from "@/lib/channels";
import { DRAFT_STATUSES, type Draft, type DraftStatus, type Lead } from "@/lib/types";
import { api, type ViewProps } from "../page";
import { ChannelBadge, copyText, daysFromToday, Empty, Status } from "./ui";

/** The spec's Action column: one contextual next step per status. */
const PRIMARY_ACTION: Record<DraftStatus, string> = {
  needs_review: "Review",
  approved: "Copy draft",
  ready: "Copy draft",
  waiting_consent: "Hold",
  held: "Reopen",
  saved_to_drafts: "Open platform",
  sent: "Record reply",
  replied: "Qualify",
  qualified: "View",
};

const ACTIONABLE: DraftStatus[] = ["needs_review", "approved", "ready", "waiting_consent"];

export default function InboxView({ data, busy, refresh, run, flash }: ViewProps) {
  const [campaignId, setCampaignId] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const leadsById = useMemo(() => new Map(data.leads.map((lead) => [lead.id, lead])), [data.leads]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.drafts
      .filter((draft) => campaignId === "all" || draft.campaignId === campaignId)
      .filter((draft) => channel === "all" || draft.channel === channel)
      .filter((draft) =>
        status === "all" ? true : status === "open" ? ACTIONABLE.includes(draft.status) : draft.status === status,
      )
      .filter((draft) => {
        if (!needle) return true;
        const lead = draft.leadId ? leadsById.get(draft.leadId) : undefined;
        return [lead?.company, lead?.contactName, lead?.role, draft.subject, draft.body]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => {
        const priority = CHANNEL_META[a.channel].priority - CHANNEL_META[b.channel].priority;
        if (priority !== 0) return priority;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [campaignId, channel, status, search, data.drafts, leadsById]);

  const selected = rows.find((draft) => draft.id === selectedId) ?? data.drafts.find((d) => d.id === selectedId);

  return (
    <div className="inbox-layout">
      <section className="page-panel">
        <div className="filters">
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="all">All campaigns</option>
            {data.campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </select>
          <select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="all">All channels</option>
            {CHANNELS_BY_PRIORITY.map((meta) => (
              <option key={meta.id} value={meta.id}>{meta.priority}. {meta.label}</option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="open">Needs action</option>
            <option value="all">All statuses</option>
            {DRAFT_STATUSES.map((value) => (
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            ))}
          </select>
          <input
            placeholder="Search contact, company or text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="filter-count">{rows.length} draft{rows.length === 1 ? "" : "s"}</span>
        </div>

        {rows.length === 0 ? (
          <Empty
            title="Nothing waiting"
            body="Add or import leads, then generate drafts per channel. Approved drafts land here for you to copy and send manually."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Channel</th>
                  <th>Draft type</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((draft) => {
                  const lead = draft.leadId ? leadsById.get(draft.leadId) : undefined;
                  return (
                    <tr
                      key={draft.id}
                      className={draft.id === selectedId ? "is-selected" : ""}
                      onClick={() => setSelectedId(draft.id)}
                    >
                      <td>{lead?.contactName || (draft.leadId ? "—" : "Channel content")}</td>
                      <td>
                        {lead?.company || data.campaigns.find((c) => c.id === draft.campaignId)?.name || "—"}
                        {lead?.doNotContact && <span className="tag tag-danger">DNC</span>}
                      </td>
                      <td><ChannelBadge channel={draft.channel} /></td>
                      <td>{draftTypeLabel(draft.type)}{draft.sequenceStep > 1 && <small> · step {draft.sequenceStep}</small>}</td>
                      <td><Status status={draft.status} /></td>
                      <td>
                        <button
                          className="row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(draft.id);
                          }}
                        >
                          {PRIMARY_ACTION[draft.status]}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <DraftPanel
          key={selected.id}
          draft={selected}
          lead={selected.leadId ? leadsById.get(selected.leadId) : undefined}
          settings={data.settings}
          busy={busy}
          refresh={refresh}
          run={run}
          flash={flash}
          onClose={() => setSelectedId("")}
        />
      ) : (
        <aside className="side-panel">
          <h3 className="section-title">Channel priority</h3>
          <ol className="workflow-list">
            {CHANNELS_BY_PRIORITY.map((meta) => (
              <li key={meta.id}>
                <strong>{meta.label}</strong>
                <span>{meta.bestFor}</span>
              </li>
            ))}
          </ol>
          <div className="safety-card">
            <span className="shield">✓</span>
            <div>
              <strong>Safe by design</strong>
              <p>Research → draft → approve → open → copy → send manually. Approval is recorded before any message leaves the app.</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

interface PanelProps extends Pick<ViewProps, "busy" | "refresh" | "run" | "flash"> {
  draft: Draft;
  lead?: Lead;
  settings: ViewProps["data"]["settings"];
  onClose: () => void;
}

function DraftPanel({ draft, lead, settings, busy, refresh, run, flash, onClose }: PanelProps) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [replyNote, setReplyNote] = useState(draft.replyNote);
  const [showReply, setShowReply] = useState(false);
  const [followUpOn, setFollowUpOn] = useState(daysFromToday(settings.followUpDays));
  const [followUpNote, setFollowUpNote] = useState("");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [dncReason, setDncReason] = useState("");
  const [showDnc, setShowDnc] = useState(false);
  const [mailClient, setMailClient] = useState<MailClient>("gmail");

  // A refresh after an action brings new server values in. Adopt them during
  // render — React's pattern for adjusting state when a prop changes — so the
  // unsaved subject/body edits above are never clobbered by an effect.
  const [seenReplyNote, setSeenReplyNote] = useState(draft.replyNote);
  if (seenReplyNote !== draft.replyNote) {
    setSeenReplyNote(draft.replyNote);
    setReplyNote(draft.replyNote);
  }

  const meta = CHANNEL_META[draft.channel];
  const gate = lead ? channelGate(lead, draft.channel) : { allowed: true, reason: "Channel content" };
  const dirty = subject !== draft.subject || body !== draft.body;
  const platformUrl = lead ? openPlatformUrl(lead, draft.channel, { subject, body }, mailClient) : "";
  const message = draft.channel === "email" && subject ? `${subject}\n\n${body}` : body;

  const act = (action: string, label: string, extra: Record<string, unknown> = {}) =>
    run(label, async () => {
      await api("/api/drafts", {
        method: "PATCH",
        body: JSON.stringify({ id: draft.id, action, ...extra }),
      });
      await refresh();
    });

  return (
    <aside className="draft-panel">
      <header>
        <div>
          <ChannelBadge channel={draft.channel} />
          <h3>{draftTypeLabel(draft.type)}</h3>
        </div>
        <button className="ghost-button" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <div className="panel-lead">
        <strong>{lead?.contactName || "Channel content"}</strong>
        <span>{[lead?.role, lead?.company].filter(Boolean).join(" · ") || meta.label}</span>
        {lead && (
          <ul className="lead-facts">
            {lead.location && <li>{lead.location}</li>}
            {lead.email && <li>{lead.email}</li>}
            {lead.phone && <li>{lead.phone}</li>}
            <li>Priority {lead.priority}</li>
            <li>Email stage: {lead.emailStage.replaceAll("_", " ")}</li>
          </ul>
        )}
        <p className={gate.allowed ? "gate gate-ok" : "gate gate-blocked"}>
          {gate.allowed ? "✓ " : "✕ "}
          {gate.reason}
        </p>
        <p className="policy-note">{meta.policy}</p>
      </div>

      <label className="field-row">
        <span>Status</span>
        <Status status={draft.status} />
      </label>

      {(draft.channel === "email" || subject) && (
        <label className="field-row">
          <span>Subject</span>
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={300} />
        </label>
      )}

      <label className="field-row">
        <span>Message <small>{body.length} characters</small></span>
        <textarea rows={12} value={body} onChange={(event) => setBody(event.target.value)} maxLength={10000} />
      </label>

      {draft.attachments.length > 0 && (
        <div className="field-row">
          <span>Recommended attachments</span>
          <div className="chip-row">
            {draft.attachments.map((name) => {
              const item = settings.collateral.find((entry) => entry.name === name);
              return item?.url ? (
                <a key={name} className="chip" href={item.url} target="_blank" rel="noreferrer noopener">{name} ↗</a>
              ) : (
                <span key={name} className="chip">{name}</span>
              );
            })}
          </div>
        </div>
      )}

      {draft.channel === "email" && (
        <label className="field-row">
          <span>Open in</span>
          <select value={mailClient} onChange={(event) => setMailClient(event.target.value as MailClient)}>
            <option value="gmail">Gmail — save as draft</option>
            <option value="outlook">Outlook web — save as draft</option>
            <option value="default">Default mail app</option>
          </select>
        </label>
      )}

      <div className="action-grid">
        <button className="primary-button" disabled={busy || !dirty} onClick={() => act("save", "Draft saved", { subject, body })}>
          {dirty ? "Save changes" : "Saved"}
        </button>
        <button
          className="secondary-button"
          disabled={busy || !gate.allowed || draft.status === "approved"}
          onClick={() => act("approve", "Approved", dirty ? { subject, body } : {})}
        >
          Approve
        </button>
        {platformUrl ? (
          <a className="secondary-button" href={platformUrl} target="_blank" rel="noreferrer noopener">
            Open {meta.label} ↗
          </a>
        ) : (
          <button className="secondary-button" disabled title="No destination stored for this channel">Open {meta.label}</button>
        )}
        <button
          className="secondary-button"
          disabled={!message}
          onClick={async () => flash((await copyText(message)) ? "Message copied" : "Copy failed — select and copy manually")}
        >
          Copy message
        </button>
        {draft.channel === "email" && (
          <button
            className="secondary-button"
            disabled={busy || draft.status === "saved_to_drafts"}
            onClick={() => act("saved_to_drafts", "Marked as saved to email drafts")}
          >
            Saved to drafts
          </button>
        )}
        <button
          className="secondary-button"
          disabled={busy || !gate.allowed}
          onClick={() => act("mark_sent", "Marked sent — follow-up scheduled", { followUpDays: settings.followUpDays })}
        >
          Mark sent
        </button>
        <button className="secondary-button" disabled={busy} onClick={() => setShowReply((value) => !value)}>
          Record reply
        </button>
        <button className="secondary-button" disabled={busy} onClick={() => setShowFollowUp((value) => !value)}>
          Schedule follow-up
        </button>
        <button className="secondary-button" disabled={busy || draft.status === "qualified"} onClick={() => act("qualify", "Marked qualified")}>
          Qualified
        </button>
        {draft.status === "held" || draft.status === "waiting_consent" ? (
          <button className="secondary-button" disabled={busy} onClick={() => act("reopen", "Reopened for review")}>
            Reopen
          </button>
        ) : (
          <button className="secondary-button" disabled={busy} onClick={() => act("hold", "Held")}>
            Hold
          </button>
        )}
        {lead && !lead.doNotContact && (
          <button className="danger-button" disabled={busy} onClick={() => setShowDnc((value) => !value)}>
            Do not contact
          </button>
        )}
      </div>

      {showReply && (
        <div className="inline-form">
          <label className="field-row">
            <span>What did they say?</span>
            <textarea rows={3} value={replyNote} onChange={(event) => setReplyNote(event.target.value)} maxLength={2000} />
          </label>
          <button className="primary-button" disabled={busy} onClick={async () => {
            await act("record_reply", "Reply recorded", { replyNote });
            setShowReply(false);
          }}>
            Save reply
          </button>
        </div>
      )}

      {showFollowUp && (
        <div className="inline-form">
          <div className="form-grid">
            <label className="field-row">
              <span>Due on</span>
              <input type="date" value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)} />
            </label>
            <label className="field-row">
              <span>Note</span>
              <input value={followUpNote} onChange={(event) => setFollowUpNote(event.target.value)} maxLength={500} />
            </label>
          </div>
          <button className="primary-button" disabled={busy || !lead} onClick={async () => {
            await run("Follow-up scheduled", async () => {
              await api("/api/followups", {
                method: "POST",
                body: JSON.stringify({
                  leadId: lead?.id,
                  draftId: draft.id,
                  campaignId: draft.campaignId,
                  channel: draft.channel,
                  dueOn: followUpOn,
                  note: followUpNote,
                }),
              });
              await refresh();
            });
            setShowFollowUp(false);
            setFollowUpNote("");
          }}>
            Add reminder
          </button>
        </div>
      )}

      {showDnc && lead && (
        <div className="inline-form">
          <label className="field-row">
            <span>Reason</span>
            <input value={dncReason} onChange={(event) => setDncReason(event.target.value)} maxLength={300} placeholder="Asked not to be contacted" />
          </label>
          <p className="policy-note">This holds every unsent draft for {lead.company} across all channels.</p>
          <button className="danger-button" disabled={busy} onClick={async () => {
            await run("Marked Do Not Contact", async () => {
              await api("/api/leads", {
                method: "PATCH",
                body: JSON.stringify({ id: lead.id, doNotContact: true, doNotContactReason: dncReason }),
              });
              await refresh();
            });
            setShowDnc(false);
          }}>
            Confirm
          </button>
        </div>
      )}
    </aside>
  );
}
