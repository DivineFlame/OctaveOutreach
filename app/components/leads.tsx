"use client";

import { useMemo, useRef, useState } from "react";
import { CHANNELS_BY_PRIORITY, CHANNEL_META, channelGate } from "@/lib/channels";
import {
  CHANNELS,
  CONSENT_STATUSES,
  VERIFICATION_STATUSES,
  WHATSAPP_NUMBER_TYPES,
  type Channel,
  type Lead,
} from "@/lib/types";
import { MAX_GENERATE_LEADS } from "@/lib/validation";
import { api, type ViewProps } from "../page";
import { ChannelBadge, Empty } from "./ui";
import XrayBuilder from "./xray";

/** Channels whose destination is a profile/page URL rather than an email or phone. */
const PROFILE_CHANNELS: Channel[] = ["linkedin", "instagram", "facebook", "x", "youtube"];

type Panel = "xray" | "new" | "edit";

/**
 * The editable subset of a lead. `emailStage` is deliberately excluded — the API
 * advances it as drafts are approved and sent, so the form must never write it back.
 */
type LeadValues = Omit<
  Lead,
  | "id"
  | "campaignId"
  | "status"
  | "emailStage"
  | "consentRecordedAt"
  | "lastContactedAt"
  | "repliedAt"
  | "discoveredAt"
  | "createdAt"
  | "updatedAt"
>;

const BLANK: LeadValues = {
  company: "",
  contactName: "",
  role: "",
  companyDomain: "",
  industry: "",
  location: "",
  email: "",
  phone: "",
  channel: "linkedin",
  profileUrl: "",
  profiles: {},
  sourceUrl: "",
  priority: "B",
  verificationStatus: "unverified",
  verificationSource: "",
  consentStatus: "unknown",
  consentBasis: "",
  whatsappNumberType: "unknown",
  doNotContact: false,
  doNotContactReason: "",
  notes: "",
};

/** Copy exactly the editable keys, so no server-owned field is echoed back. */
function editableFields(source: LeadValues): LeadValues {
  const out = { ...BLANK };
  for (const key of Object.keys(BLANK) as (keyof LeadValues)[]) {
    (out as Record<string, unknown>)[key] = source[key];
  }
  out.profiles = { ...source.profiles };
  return out;
}

export default function LeadsView({ data, busy, refresh, run, flash, go }: ViewProps) {
  const [chosenCampaign, setChosenCampaign] = useState("");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<Panel>("xray");
  const [editingId, setEditingId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [genChannels, setGenChannels] = useState<Channel[]>([]);
  const [regenerate, setRegenerate] = useState(false);
  const [importChannel, setImportChannel] = useState<Channel>("linkedin");
  const [importReport, setImportReport] = useState<{ created: number; duplicates: number; invalid: number; errors: { row: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Campaigns arrive after the first render, so fall back to the first one
  // rather than waiting for an effect to pick it.
  const campaignId = chosenCampaign || data.campaigns[0]?.id || "";
  const campaign = data.campaigns.find((item) => item.id === campaignId);

  // Switching campaign resets the generation channels to that campaign's own
  // list and clears the selection. Adjusted during render, which is React's
  // pattern for reacting to a changed input without an effect.
  const [seenCampaign, setSeenCampaign] = useState("");
  if (seenCampaign !== campaignId) {
    setSeenCampaign(campaignId);
    setGenChannels(campaign?.channels ?? ["linkedin", "email"]);
    setSelected([]);
  }

  const leads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.leads
      .filter((lead) => lead.campaignId === campaignId)
      .filter((lead) =>
        !needle || [lead.company, lead.contactName, lead.role, lead.email, lead.location, lead.notes].join(" ").toLowerCase().includes(needle),
      )
      .sort((a, b) => a.priority.localeCompare(b.priority) || a.company.localeCompare(b.company));
  }, [data.leads, campaignId, search]);

  const draftCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const draft of data.drafts) {
      if (!draft.leadId) continue;
      counts.set(draft.leadId, (counts.get(draft.leadId) ?? 0) + 1);
    }
    return counts;
  }, [data.drafts]);

  const editing = data.leads.find((lead) => lead.id === editingId);
  const allSelected = leads.length > 0 && selected.length === leads.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= MAX_GENERATE_LEADS) {
        flash(`You can generate drafts for at most ${MAX_GENERATE_LEADS} leads at a time`);
        return current;
      }
      return [...current, id];
    });

  async function importFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      flash("Choose a CSV or XLSX file first");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("campaignId", campaignId);
    form.append("defaultChannel", importChannel);
    const report = await run("", async () => {
      const result = await api<{ created: number; duplicates: number; invalid: number; errors: { row: number; message: string }[]; total: number }>(
        "/api/leads/import",
        { method: "POST", body: form },
      );
      await refresh();
      return result;
    });
    if (report) {
      setImportReport(report);
      flash(`Imported ${report.created} of ${report.total} rows`);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function generate() {
    await run("", async () => {
      const result = await api<{ created: number; skipped: number }>("/api/drafts", {
        method: "POST",
        body: JSON.stringify({ campaignId, leadIds: selected, channels: genChannels, regenerate }),
      });
      await refresh();
      flash(`${result.created} draft${result.created === 1 ? "" : "s"} generated${result.skipped ? `, ${result.skipped} skipped` : ""}`);
      setSelected([]);
    });
  }

  if (data.campaigns.length === 0) {
    return (
      <section className="page-panel">
        <Empty
          title="Create a campaign first"
          body="A campaign holds the website analysis, market and channel mix that every draft is written against."
          action="Go to campaigns"
          onAction={() => go("campaigns")}
        />
      </section>
    );
  }

  return (
    <div className="inbox-layout">
      <section className="page-panel">
        <div className="filters">
          <select value={campaignId} onChange={(event) => setChosenCampaign(event.target.value)}>
            {data.campaigns.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <input placeholder="Search leads" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="primary-button" onClick={() => { setPanel("new"); setEditingId(""); }}>Add lead</button>
          <button className={`secondary-button${panel === "xray" ? " is-active" : ""}`} onClick={() => setPanel("xray")}>
            X-Ray search
          </button>
          <span className="filter-count">{leads.length} lead{leads.length === 1 ? "" : "s"}</span>
        </div>

        <div className="import-row">
          <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" />
          <select value={importChannel} onChange={(event) => setImportChannel(event.target.value as Channel)}>
            {CHANNELS_BY_PRIORITY.map((meta) => (
              <option key={meta.id} value={meta.id}>Default: {meta.label}</option>
            ))}
          </select>
          <button className="secondary-button" disabled={busy} onClick={importFile}>Import CSV / XLSX</button>
          <small>Headers are matched automatically — company, contact, role, email, phone, linkedin, instagram, consent and more.</small>
        </div>

        {importReport && (
          <div className="alert">
            Created {importReport.created} · duplicates skipped {importReport.duplicates} · invalid {importReport.invalid}
            {importReport.errors.length > 0 && (
              <ul>
                {importReport.errors.slice(0, 5).map((issue) => (
                  <li key={issue.row}>Row {issue.row}: {issue.message}</li>
                ))}
              </ul>
            )}
            <button className="ghost-button" onClick={() => setImportReport(null)}>Dismiss</button>
          </div>
        )}

        {selected.length > 0 && (
          <div className="bulk-bar">
            <strong>{selected.length} selected</strong>
            <div className="chip-row">
              {CHANNELS_BY_PRIORITY.map((meta) => (
                <button
                  key={meta.id}
                  className={`chip${genChannels.includes(meta.id) ? " is-on" : ""}`}
                  onClick={() =>
                    setGenChannels((current) =>
                      current.includes(meta.id) ? current.filter((value) => value !== meta.id) : [...current, meta.id],
                    )
                  }
                >
                  {meta.label}
                </button>
              ))}
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={regenerate} onChange={(event) => setRegenerate(event.target.checked)} />
              <span>Replace existing unsent drafts</span>
            </label>
            <button className="primary-button" disabled={busy || genChannels.length === 0} onClick={generate}>
              Generate drafts
            </button>
            <button className="ghost-button" onClick={() => setSelected([])}>Clear</button>
          </div>
        )}

        {leads.length === 0 ? (
          <Empty
            title="No leads yet"
            body="Use the X-Ray search builder to find publicly listed decision-makers, then add them here — or import a spreadsheet you already have."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => {
                        if (!event.target.checked) {
                          setSelected([]);
                          return;
                        }
                        setSelected(leads.slice(0, MAX_GENERATE_LEADS).map((lead) => lead.id));
                        if (leads.length > MAX_GENERATE_LEADS) {
                          flash(`Selected the first ${MAX_GENERATE_LEADS} leads — generate the rest in a second batch`);
                        }
                      }}
                    />
                  </th>
                  <th>Priority</th>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Channel</th>
                  <th>Email stage</th>
                  <th>Consent</th>
                  <th>Drafts</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={lead.id === editingId ? "is-selected" : ""}
                    onClick={() => { setEditingId(lead.id); setPanel("edit"); }}
                  >
                    <td onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggle(lead.id)} />
                    </td>
                    <td><span className={`priority p-${lead.priority}`}>{lead.priority}</span></td>
                    <td>
                      {lead.company}
                      {lead.doNotContact && <span className="tag tag-danger">DNC</span>}
                    </td>
                    <td>{lead.contactName || "—"}</td>
                    <td>{lead.role || "—"}</td>
                    <td><ChannelBadge channel={lead.channel} /></td>
                    <td>{lead.emailStage.replaceAll("_", " ")}</td>
                    <td>{lead.consentStatus.replaceAll("_", " ")}</td>
                    <td>{draftCounts.get(lead.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {panel === "new" ? (
        <LeadForm
          key="new"
          title="Add lead"
          initial={{ ...BLANK }}
          busy={busy}
          onCancel={() => setPanel("xray")}
          onSubmit={async (values) => {
            const result = await run("", async () => {
              const response = await api<{ duplicate?: boolean }>("/api/leads", {
                method: "POST",
                body: JSON.stringify({ campaignId, ...values }),
              });
              await refresh();
              return response;
            });
            if (result) {
              flash(result.duplicate ? "That lead already exists in this campaign" : "Lead added");
              if (!result.duplicate) setPanel("xray");
            }
          }}
        />
      ) : panel === "edit" && editing ? (
        <LeadForm
          key={editing.id}
          title={editing.company}
          initial={editing}
          busy={busy}
          onCancel={() => { setPanel("xray"); setEditingId(""); }}
          onSubmit={async (values) => {
            await run("Lead updated", async () => {
              await api("/api/leads", { method: "PATCH", body: JSON.stringify({ id: editing.id, ...values }) });
              await refresh();
            });
          }}
        />
      ) : (
        <XrayBuilder campaign={campaign} settings={data.settings} flash={flash} />
      )}
    </div>
  );
}

type LeadFormProps = {
  title: string;
  initial: LeadValues;
  busy: boolean;
  onSubmit: (values: LeadValues) => Promise<void>;
  onCancel: () => void;
};

function LeadForm({ title, initial, busy, onSubmit, onCancel }: LeadFormProps) {
  const [values, setValues] = useState<LeadValues>(() => editableFields(initial));
  const set = <K extends keyof LeadValues>(key: K, value: LeadValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // Consent and number-type gates, previewed live for every channel.
  const gates = CHANNELS.map((channel) => ({
    channel,
    gate: channelGate(
      {
        ...values,
        id: "",
        campaignId: "",
        status: "",
        emailStage: "none",
        consentRecordedAt: null,
        lastContactedAt: null,
        repliedAt: null,
        discoveredAt: "",
        createdAt: "",
        updatedAt: "",
      },
      channel,
    ),
  }));

  return (
    <aside className="draft-panel">
      <header>
        <h3>{title}</h3>
        <button className="ghost-button" onClick={onCancel} aria-label="Close">✕</button>
      </header>

      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(values);
        }}
      >
        <div className="form-grid">
          <label className="field-row">
            <span>Company *</span>
            <input required value={values.company} onChange={(event) => set("company", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Contact name</span>
            <input value={values.contactName} onChange={(event) => set("contactName", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Role</span>
            <input value={values.role} onChange={(event) => set("role", event.target.value)} placeholder="Purchase Manager" />
          </label>
          <label className="field-row">
            <span>Website / domain</span>
            <input value={values.companyDomain} onChange={(event) => set("companyDomain", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Industry</span>
            <input value={values.industry} onChange={(event) => set("industry", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Location</span>
            <input value={values.location} onChange={(event) => set("location", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Email</span>
            <input type="email" value={values.email} onChange={(event) => set("email", event.target.value)} />
          </label>
          <label className="field-row">
            <span>Phone / WhatsApp</span>
            <input value={values.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+91…" />
          </label>
          <label className="field-row">
            <span>Primary channel</span>
            <select value={values.channel} onChange={(event) => set("channel", event.target.value as Channel)}>
              {CHANNELS_BY_PRIORITY.map((meta) => (
                <option key={meta.id} value={meta.id}>{meta.label}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Priority</span>
            <select value={values.priority} onChange={(event) => set("priority", event.target.value as LeadValues["priority"])}>
              <option value="A">A — best fit</option>
              <option value="B">B — good fit</option>
              <option value="C">C — nurture</option>
            </select>
          </label>
        </div>

        <h4 className="section-title">Profiles</h4>
        <div className="form-grid">
          {PROFILE_CHANNELS.map((channel) => (
            <label key={channel} className="field-row">
              <span>{CHANNEL_META[channel].label}</span>
              <input
                value={values.profiles[channel] ?? ""}
                onChange={(event) => set("profiles", { ...values.profiles, [channel]: event.target.value })}
                placeholder={channel === "linkedin" ? "https://www.linkedin.com/in/…" : "@handle or URL"}
              />
            </label>
          ))}
          <label className="field-row">
            <span>Source URL <small>where you found them</small></span>
            <input value={values.sourceUrl} onChange={(event) => set("sourceUrl", event.target.value)} />
          </label>
        </div>

        <h4 className="section-title">Verification &amp; consent</h4>
        <div className="form-grid">
          <label className="field-row">
            <span>Email verification</span>
            <select value={values.verificationStatus} onChange={(event) => set("verificationStatus", event.target.value as LeadValues["verificationStatus"])}>
              {VERIFICATION_STATUSES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Verification source</span>
            <input value={values.verificationSource} onChange={(event) => set("verificationSource", event.target.value)} placeholder="Company contact page" />
          </label>
          <label className="field-row">
            <span>WhatsApp number type</span>
            <select value={values.whatsappNumberType} onChange={(event) => set("whatsappNumberType", event.target.value as LeadValues["whatsappNumberType"])}>
              {WHATSAPP_NUMBER_TYPES.map((value) => (
                <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Consent status</span>
            <select value={values.consentStatus} onChange={(event) => set("consentStatus", event.target.value as LeadValues["consentStatus"])}>
              {CONSENT_STATUSES.map((value) => (
                <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="field-row span-2">
            <span>Consent basis <small>how they opted in</small></span>
            <input
              value={values.consentBasis}
              onChange={(event) => set("consentBasis", event.target.value)}
              placeholder="Published WhatsApp Business number on company website"
            />
          </label>
        </div>

        <ul className="gate-list">
          {gates.map(({ channel, gate }) => (
            <li key={channel} className={gate.allowed ? "gate-ok" : "gate-blocked"}>
              <strong>{CHANNEL_META[channel].label}</strong>
              <span>{gate.reason}</span>
            </li>
          ))}
        </ul>

        <label className="toggle-row">
          <input type="checkbox" checked={values.doNotContact} onChange={(event) => set("doNotContact", event.target.checked)} />
          <span>Do not contact</span>
        </label>
        {values.doNotContact && (
          <label className="field-row">
            <span>Reason</span>
            <input value={values.doNotContactReason} onChange={(event) => set("doNotContactReason", event.target.value)} />
          </label>
        )}

        <label className="field-row">
          <span>Research notes</span>
          <textarea rows={4} value={values.notes} onChange={(event) => set("notes", event.target.value)} />
        </label>

        <div className="action-grid">
          <button className="primary-button" type="submit" disabled={busy || !values.company.trim()}>Save lead</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </aside>
  );
}
