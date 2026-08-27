"use client";

import { useState } from "react";
import { CHANNELS_BY_PRIORITY } from "@/lib/channels";
import { googleUrl } from "@/lib/xray";
import type { Campaign, Channel } from "@/lib/types";
import { api, type ViewProps } from "../page";
import { copyText, formatDate } from "./ui";

const STEPS = [
  ["Analyse", "Read the public website and derive products, buyer segments and the pitch."],
  ["Research", "Build Google X-Ray strings per channel and add the leads you verify."],
  ["Draft", "Generate a per-channel draft for every lead, with the right collateral attached."],
  ["Approve", "A reviewer signs off. Nothing can be marked sent before it is approved."],
  ["Send manually", "Open the profile or compose window, copy the message, send it yourself."],
  ["Record", "Log the send, the reply and the next follow-up so nothing is chased twice."],
];

export default function CampaignsView({ data, busy, refresh, run, flash, go }: ViewProps) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [market, setMarket] = useState(data.settings.defaultMarket);
  const [leadGoal, setLeadGoal] = useState(25);
  const [channels, setChannels] = useState<Channel[]>(["linkedin", "email"]);
  const [selectedId, setSelectedId] = useState(data.campaigns[0]?.id ?? "");

  const selected = data.campaigns.find((item) => item.id === selectedId) ?? data.campaigns[0];

  async function create() {
    const created = await run("", async () => {
      const result = await api<{ campaign: Campaign }>("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name, website, market, leadGoal, channels }),
      });
      await refresh();
      return result;
    });
    if (created) {
      flash(`${created.campaign.name} analysed — add leads next`);
      setSelectedId(created.campaign.id);
      setName("");
      setWebsite("");
    }
  }

  return (
    <div className="campaign-layout">
      <section className="campaign-panel">
        <h3 className="section-title">New campaign</h3>
        <form className="campaign-form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <label className="field-row">
            <span>Campaign name</span>
            <input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Bulk carrier oils — India" />
          </label>
          <label className="field-row">
            <span>Website to analyse</span>
            <input required type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://example.com" />
          </label>
          <div className="form-grid">
            <label className="field-row">
              <span>Market</span>
              <input required value={market} onChange={(event) => setMarket(event.target.value)} />
            </label>
            <label className="field-row">
              <span>Lead goal</span>
              <input type="number" min={1} max={500} value={leadGoal} onChange={(event) => setLeadGoal(Number(event.target.value))} />
            </label>
          </div>
          <div className="field-row">
            <span>Channels <small>in priority order</small></span>
            <div className="channel-list">
              {CHANNELS_BY_PRIORITY.map((meta) => (
                <button
                  type="button"
                  key={meta.id}
                  className={`channel-chip${channels.includes(meta.id) ? " is-on" : ""}`}
                  title={meta.bestFor}
                  onClick={() =>
                    setChannels((current) =>
                      current.includes(meta.id) ? current.filter((value) => value !== meta.id) : [...current, meta.id],
                    )
                  }
                >
                  <i>{meta.priority}</i>
                  {meta.label}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-button" type="submit" disabled={busy || channels.length === 0}>
            {busy ? "Analysing…" : "Analyse website"}
          </button>
          <p className="policy-note">
            Only the public website is read — no logins, no scraping behind authentication. Private addresses are rejected.
          </p>
        </form>

        {data.campaigns.length > 0 && (
          <>
            <h3 className="section-title">Campaigns</h3>
            <ul className="campaign-list">
              {data.campaigns.map((campaign) => {
                const leads = data.leads.filter((lead) => lead.campaignId === campaign.id).length;
                const drafts = data.drafts.filter((draft) => draft.campaignId === campaign.id).length;
                return (
                  <li key={campaign.id}>
                    <button className={campaign.id === selected?.id ? "is-active" : ""} onClick={() => setSelectedId(campaign.id)}>
                      <strong>{campaign.name}</strong>
                      <span>{campaign.market} · {leads} leads · {drafts} drafts</span>
                      <small>{formatDate(campaign.createdAt)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="results-panel">
        {selected?.analysis ? (
          <>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{selected.website}</p>
                <h3>{selected.name}</h3>
              </div>
              <button className="secondary-button" onClick={() => go("leads")}>Add leads →</button>
            </div>
            <p className="analysis-summary">{selected.analysis.summary}</p>
            <div className="analysis-grid">
              <div className="analysis-card">
                <h4>Products</h4>
                <ul>{selected.analysis.products.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="analysis-card">
                <h4>Buyer segments</h4>
                <ul>{selected.analysis.buyerSegments.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="analysis-card">
                <h4>Value propositions</h4>
                <ul>{selected.analysis.valuePropositions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <div className="analysis-card span-2">
                <h4>Pitch</h4>
                <p>{selected.analysis.pitch}</p>
              </div>
              <div className="analysis-card span-2">
                <h4>Suggested X-Ray strings</h4>
                <ul className="xray-list">
                  {selected.analysis.xrayStrings.map((query) => (
                    <li key={query}>
                      <code>{query}</code>
                      <div className="chip-row">
                        <a className="chip" href={googleUrl(query)} target="_blank" rel="noreferrer noopener">Search ↗</a>
                        <button className="chip" onClick={async () => flash((await copyText(query)) ? "Query copied" : "Copy failed")}>Copy</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="section-title">How the agent works</h3>
            <ol className="workflow-list numbered">
              {STEPS.map(([step, detail], index) => (
                <li key={step}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <strong>{step}</strong>
                    <span>{detail}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="safety-card">
              <span className="shield">✓</span>
              <div>
                <strong>Nothing is sent automatically</strong>
                <p>
                  LinkedIn connects, WhatsApp messages, Instagram DMs, Facebook Page messages, X posts and YouTube uploads
                  all stay in your hands. The agent researches, drafts and records — you send.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
