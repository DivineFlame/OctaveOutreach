"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Campaign, Channel, Draft, DraftStatus, WorkspaceData, WorkspaceSettings } from "@/lib/types";

const channels: { id: Channel; label: string; short: string }[] = [
  { id: "linkedin", label: "LinkedIn", short: "in" }, { id: "email", label: "Email", short: "@" },
  { id: "whatsapp", label: "WhatsApp", short: "WA" }, { id: "instagram", label: "Instagram", short: "IG" },
  { id: "facebook", label: "Facebook", short: "f" }, { id: "x", label: "X", short: "X" },
  { id: "youtube", label: "YouTube", short: "YT" },
];
const emptySettings: WorkspaceSettings = { companyName: "Octave", companyWebsite: "", senderName: "", senderTitle: "Business Development", defaultMarket: "India", tone: "consultative", dailyDraftLimit: 15, followUpDays: 7, approvalRequired: true, publicDataOnly: true, signature: "Regards" };
type View = "campaigns" | "drafts" | "leads" | "settings";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

export default function Home() {
  const [view, setView] = useState<View>("campaigns");
  const [data, setData] = useState<WorkspaceData>({ campaigns: [], drafts: [], leads: [], settings: emptySettings });
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""); const [error, setError] = useState("");

  useEffect(() => { api<WorkspaceData>("/api/workspace").then((workspace) => { setData(workspace); setSelectedCampaign(workspace.campaigns[0]?.id || ""); }).catch((err) => setError(`${err.message}. Check the database connection and run migrations.`)).finally(() => setLoading(false)); }, []);
  const campaign = useMemo(() => data.campaigns.find((item) => item.id === selectedCampaign) || data.campaigns[0], [data.campaigns, selectedCampaign]);
  function flash(message: string) { setNotice(message); setError(""); window.setTimeout(() => setNotice(""), 3500); }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ campaign: Campaign; drafts: Draft[] }>("/api/campaigns", { method: "POST", body: JSON.stringify({ website: form.get("website"), name: form.get("name"), market: form.get("market"), leadGoal: Number(form.get("leadGoal")), channels: channels.filter(({ id }) => form.get(id) === "on").map(({ id }) => id) }) });
      setData((current) => ({ ...current, campaigns: [result.campaign, ...current.campaigns], drafts: [...result.drafts, ...current.drafts] })); setSelectedCampaign(result.campaign.id); flash("Campaign analysed and channel drafts prepared.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create campaign"); } finally { setBusy(false); }
  }
  async function updateDraft(id: string, patch: Partial<Pick<Draft, "body" | "subject" | "status">>) {
    setBusy(true); setError("");
    try { await api("/api/drafts", { method: "PATCH", body: JSON.stringify({ id, ...patch }) }); setData((current) => ({ ...current, drafts: current.drafts.map((draft) => draft.id === id ? { ...draft, ...patch, updatedAt: new Date().toISOString() } : draft) })); flash(patch.status === "sent" ? "Recorded as manually sent." : "Draft saved."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save draft"); } finally { setBusy(false); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const settings: WorkspaceSettings = { companyName: String(form.get("companyName")), companyWebsite: String(form.get("companyWebsite")), senderName: String(form.get("senderName")), senderTitle: String(form.get("senderTitle")), defaultMarket: String(form.get("defaultMarket")), tone: form.get("tone") as WorkspaceSettings["tone"], dailyDraftLimit: Number(form.get("dailyDraftLimit")), followUpDays: Number(form.get("followUpDays")), approvalRequired: form.get("approvalRequired") === "on", publicDataOnly: form.get("publicDataOnly") === "on", signature: String(form.get("signature")) };
    try { await api("/api/workspace", { method: "PUT", body: JSON.stringify(settings) }); setData((current) => ({ ...current, settings })); flash("Workspace settings saved."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not save settings"); } finally { setBusy(false); }
  }
  const nav: { id: View; label: string; short: string; count?: number }[] = [{ id: "campaigns", label: "Campaigns", short: "C", count: data.campaigns.length }, { id: "drafts", label: "Drafts", short: "D", count: data.drafts.filter((d) => d.status === "needs_review").length }, { id: "leads", label: "Leads", short: "L", count: data.leads.length }];
  return <main className="app-shell">
    <aside className="sidebar"><div className="brand-mark">OA</div><nav aria-label="Primary navigation">{nav.map((item) => <button key={item.id} className={`nav-item ${view === item.id ? "active" : ""}`} onClick={() => setView(item.id)} title={item.label}><span>{item.short}</span>{item.count ? <b>{item.count}</b> : null}</button>)}</nav><button className={`nav-item settings ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")} title="Settings"><span>S</span></button></aside>
    <section className="workspace"><header className="topbar"><div><p className="eyebrow">Outreach agent</p><h1>{view === "campaigns" ? "Campaign studio" : view[0].toUpperCase() + view.slice(1)}</h1></div><div className="safe-mode"><span /> Manual send mode</div></header>
      {error && <div className="alert error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}{notice && <div className="alert success" role="status">{notice}</div>}{loading && <div className="loading-card">Loading secure workspace…</div>}
      {!loading && view === "campaigns" && <Campaigns data={data} campaign={campaign} selectedCampaign={selectedCampaign} setSelectedCampaign={setSelectedCampaign} createCampaign={createCampaign} busy={busy} />}
      {!loading && view === "drafts" && <Drafts drafts={data.drafts} leads={data.leads} busy={busy} updateDraft={updateDraft} />}
      {!loading && view === "leads" && <Leads data={data} campaign={campaign} setView={setView} />}
      {!loading && view === "settings" && <Settings settings={data.settings} busy={busy} saveSettings={saveSettings} />}
    </section>
  </main>;
}

function Campaigns({ data, campaign, selectedCampaign, setSelectedCampaign, createCampaign, busy }: { data: WorkspaceData; campaign?: Campaign; selectedCampaign: string; setSelectedCampaign: (id: string) => void; createCampaign: (e: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  return <div className="campaign-layout"><section className="campaign-panel"><div className="panel-heading"><div><span className="step-number">01</span><p>Start with a company website</p><h2>Turn any offer into an approved outreach campaign.</h2></div><span className="draft-pill">Draft only</span></div>
    <form className="campaign-form" onSubmit={createCampaign}><label>Website<input name="website" type="url" defaultValue="https://nuveoils.com" required /></label><div className="field-row"><label>Campaign name<input name="name" defaultValue="Nuve Oils — India B2B" required /></label><label>Target market<input name="market" defaultValue="India" required /></label></div><div className="field-row"><label>Lead goal<input name="leadGoal" type="number" min="1" max="500" defaultValue="100" required /></label><div /></div><fieldset><legend>Channels</legend><div className="channel-list">{channels.map(({ id, label, short }, index) => <label className="channel-chip" key={id}><input name={id} type="checkbox" defaultChecked={index < 4} /><span>{short}</span>{label}</label>)}</div></fieldset><button disabled={busy} className="primary-button">{busy ? "Analysing website…" : "Analyse & prepare campaign"}<span>→</span></button></form></section>
    <aside className="side-panel"><p className="eyebrow">Workflow</p><ol className="workflow-list"><li className="current"><span>1</span><div><strong>Analyse</strong><p>Products, offer and buyer fit</p></div></li><li><span>2</span><div><strong>Build pitch</strong><p>Messages and collateral</p></div></li><li><span>3</span><div><strong>Find leads</strong><p>X-Ray strings and public sources</p></div></li><li><span>4</span><div><strong>Review drafts</strong><p>Approve before outreach</p></div></li></ol><div className="safety-card"><div className="shield">✓</div><div><strong>Human-controlled</strong><p>The agent prepares drafts. You open the platform and send manually.</p></div></div></aside>
    {data.campaigns.length > 0 && <section className="results-panel wide"><div className="section-title"><div><p className="eyebrow">Campaign output</p><h3>Analysis & sales kit</h3></div><select aria-label="Select campaign" value={selectedCampaign || campaign?.id} onChange={(e) => setSelectedCampaign(e.target.value)}>{data.campaigns.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>{campaign?.analysis && <div className="analysis-grid"><article className="analysis-card span-2"><span>Executive summary</span><p>{campaign.analysis.summary}</p></article><ListCard title="Products & offers" items={campaign.analysis.products} /><ListCard title="Buying business entities" items={campaign.analysis.buyerSegments} /><article className="analysis-card span-2 pitch"><span>Client-ready pitch</span><p>{campaign.analysis.pitch}</p></article><article className="analysis-card span-2"><span>Google X-Ray strings</span>{campaign.analysis.xrayStrings.map((value) => <code key={value}>{value}</code>)}</article></div>}</section>}
  </div>;
}
function ListCard({ title, items }: { title: string; items: string[] }) { return <article className="analysis-card"><span>{title}</span><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></article>; }

function Drafts({ drafts, leads, busy, updateDraft }: { drafts: Draft[]; leads: WorkspaceData["leads"]; busy: boolean; updateDraft: (id: string, patch: Partial<Pick<Draft, "body" | "subject" | "status">>) => Promise<void> }) {
  const [filter, setFilter] = useState("all"); const visible = filter === "all" ? drafts : drafts.filter((draft) => draft.status === filter);
  return <section className="page-panel"><div className="section-title"><div><p className="eyebrow">Approval queue</p><h2>Review every message before it leaves.</h2></div><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option><option value="needs_review">Needs review</option><option value="approved">Approved</option><option value="held">Held</option><option value="sent">Manually sent</option></select></div>{visible.length === 0 ? <Empty title="No drafts in this view" body="Analyse a website to prepare channel-specific messages." /> : <div className="draft-grid">{visible.map((draft) => <DraftCard key={draft.id} draft={draft} leadUrl={leads.find((item) => item.id === draft.leadId)?.profileUrl} busy={busy} updateDraft={updateDraft} />)}</div>}</section>;
}
function DraftCard({ draft, leadUrl, busy, updateDraft }: { draft: Draft; leadUrl?: string; busy: boolean; updateDraft: (id: string, patch: Partial<Pick<Draft, "body" | "subject" | "status">>) => Promise<void> }) {
  const [subject, setSubject] = useState(draft.subject); const [body, setBody] = useState(draft.body); const label = channels.find((channel) => channel.id === draft.channel)?.label || draft.channel;
  return <article className="draft-card"><header><div><span className="channel-badge">{label}</span><small>{draft.type.replace("_", " ")}</small></div><Status status={draft.status} /></header>{draft.subject && <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>}<label>Message<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} /></label><footer><button className="secondary-button" disabled={busy} onClick={() => updateDraft(draft.id, { subject, body })}>Save</button><select aria-label="Draft status" value={draft.status} disabled={busy} onChange={(e) => updateDraft(draft.id, { status: e.target.value as DraftStatus })}><option value="needs_review">Needs review</option><option value="approved">Approved</option><option value="held">Held</option><option value="sent">Manually sent</option><option value="replied">Replied</option></select>{leadUrl && <a className="primary-link" href={leadUrl} target="_blank" rel="noreferrer">Open profile ↗</a>}</footer></article>;
}
function Status({ status }: { status: DraftStatus }) { return <span className={`status status-${status}`}>{status.replaceAll("_", " ")}</span>; }

function Leads({ data, campaign, setView }: { data: WorkspaceData; campaign?: Campaign; setView: (view: View) => void }) {
  return <section className="page-panel"><div className="section-title"><div><p className="eyebrow">Research workspace</p><h2>Public-source lead shortlist.</h2></div><span className="draft-pill">No private-data enrichment</span></div>{data.leads.length === 0 ? <Empty title="Your lead table is ready" body={campaign ? "Use the generated X-Ray strings to identify relevant public profiles, then add verified business contacts through the upcoming import workflow." : "Create a campaign first to define buyer segments and search strings."} action={campaign ? "View campaign search kit" : "Create campaign"} onAction={() => setView("campaigns")} /> : <div className="table-wrap"><table><thead><tr><th>Priority</th><th>Company</th><th>Contact</th><th>Role</th><th>Channel</th><th>Status</th><th>Source</th></tr></thead><tbody>{data.leads.map((lead) => <tr key={lead.id}><td><b className={`priority p-${lead.priority}`}>{lead.priority}</b></td><td>{lead.company}</td><td>{lead.contactName || "—"}</td><td>{lead.role || "—"}</td><td>{lead.channel}</td><td>{lead.status}</td><td>{lead.profileUrl ? <a href={lead.profileUrl} target="_blank" rel="noreferrer">Profile ↗</a> : "—"}</td></tr>)}</tbody></table></div>}<div className="policy-note"><strong>Safe research policy</strong><p>Use public business information, respect platform terms, verify emails before use, and never infer or collect sensitive personal data.</p></div></section>;
}
function Settings({ settings, busy, saveSettings }: { settings: WorkspaceSettings; busy: boolean; saveSettings: (e: FormEvent<HTMLFormElement>) => void }) {
  return <section className="page-panel settings-panel"><div className="section-title"><div><p className="eyebrow">Workspace controls</p><h2>Configure the agent’s guardrails.</h2></div></div><form className="settings-form" onSubmit={saveSettings}><div className="settings-group"><h3>Sender identity</h3><div className="form-grid"><label>Company name<input name="companyName" defaultValue={settings.companyName} /></label><label>Company website<input name="companyWebsite" type="url" defaultValue={settings.companyWebsite} /></label><label>Sender name<input name="senderName" defaultValue={settings.senderName} /></label><label>Sender title<input name="senderTitle" defaultValue={settings.senderTitle} /></label><label className="span-2">Signature<textarea name="signature" rows={3} defaultValue={settings.signature} /></label></div></div><div className="settings-group"><h3>Campaign defaults</h3><div className="form-grid"><label>Default market<input name="defaultMarket" defaultValue={settings.defaultMarket} /></label><label>Tone<select name="tone" defaultValue={settings.tone}><option value="consultative">Consultative</option><option value="concise">Concise</option><option value="technical">Technical</option></select></label><label>Daily draft limit<input name="dailyDraftLimit" type="number" min="1" max="100" defaultValue={settings.dailyDraftLimit} /></label><label>Follow-up interval (days)<input name="followUpDays" type="number" min="1" max="60" defaultValue={settings.followUpDays} /></label></div></div><div className="settings-group"><h3>Safety</h3><label className="toggle-row"><input name="approvalRequired" type="checkbox" defaultChecked={settings.approvalRequired} /><span /><div><strong>Require human approval</strong><p>Messages stay in draft until you approve and send manually.</p></div></label><label className="toggle-row"><input name="publicDataOnly" type="checkbox" defaultChecked={settings.publicDataOnly} /><span /><div><strong>Public business data only</strong><p>Restrict research to public, professionally relevant information.</p></div></label></div><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save workspace settings"}<span>→</span></button></form></section>;
}
function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <div className="empty"><span>◎</span><h3>{title}</h3><p>{body}</p>{action && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>; }
