"use client";

import { useMemo, useState } from "react";
import { CHANNELS_BY_PRIORITY } from "@/lib/channels";
import { buildXrayStrings, DEFAULT_ROLES, googleUrl } from "@/lib/xray";
import type { Campaign, Channel, WorkspaceSettings } from "@/lib/types";
import { copyText } from "./ui";

function list(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

/**
 * The spec's lead-discovery mechanism: Google X-Ray strings. Pure string
 * building, so it runs entirely in the browser.
 */
export default function XrayBuilder({ campaign, settings, flash }: {
  campaign?: Campaign;
  settings: WorkspaceSettings;
  flash: (message: string) => void;
}) {
  const [channel, setChannel] = useState<Channel>("linkedin");
  const [market, setMarket] = useState(campaign?.market || settings.defaultMarket);
  const [roles, setRoles] = useState(DEFAULT_ROLES.join(", "));
  const [keywords, setKeywords] = useState(
    (campaign?.analysis?.products ?? []).slice(0, 4).join(", ") || settings.companyName,
  );
  const [companies, setCompanies] = useState("");

  const queries = useMemo(
    () => buildXrayStrings(channel, { market, roles: list(roles), keywords: list(keywords), companies: list(companies) }),
    [channel, market, roles, keywords, companies],
  );

  return (
    <aside className="side-panel">
      <h3 className="section-title">X-Ray search builder</h3>
      <p className="policy-note">
        Google X-Ray strings surface publicly indexed profiles and pages. Open a result, confirm the details, then add the
        lead here.
      </p>

      <label className="field-row">
        <span>Channel</span>
        <select value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
          {CHANNELS_BY_PRIORITY.map((meta) => (
            <option key={meta.id} value={meta.id}>{meta.priority}. {meta.label}</option>
          ))}
        </select>
      </label>
      <label className="field-row">
        <span>Market</span>
        <input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="India" />
      </label>
      <label className="field-row">
        <span>Products / segments <small>comma separated</small></span>
        <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="carrier oils, essential oils" />
      </label>
      {(channel === "linkedin" || channel === "email") && (
        <label className="field-row">
          <span>Roles <small>comma separated</small></span>
          <input value={roles} onChange={(event) => setRoles(event.target.value)} />
        </label>
      )}
      <label className="field-row">
        <span>Named accounts <small>optional</small></span>
        <input value={companies} onChange={(event) => setCompanies(event.target.value)} placeholder="Dabur, Himalaya" />
      </label>

      <ul className="xray-list">
        {queries.map((entry) => (
          <li key={entry.label}>
            <strong>{entry.label}</strong>
            <code>{entry.query}</code>
            <div className="chip-row">
              <a className="chip" href={googleUrl(entry.query)} target="_blank" rel="noreferrer noopener">Search ↗</a>
              <button
                className="chip"
                onClick={async () => flash((await copyText(entry.query)) ? "Query copied" : "Copy failed")}
              >
                Copy
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
