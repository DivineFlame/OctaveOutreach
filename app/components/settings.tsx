"use client";

import { useState } from "react";
import type { Collateral, WorkspaceSettings } from "@/lib/types";
import { api, type ViewProps } from "../page";

const KINDS: Collateral["kind"][] = ["brochure", "catalogue", "coa", "msds", "spec", "price_list", "other"];

export default function SettingsView({ data, busy, refresh, run }: ViewProps) {
  const [values, setValues] = useState<WorkspaceSettings>({
    ...data.settings,
    collateral: data.settings.collateral.map((item) => ({ ...item })),
  });
  const set = <K extends keyof WorkspaceSettings>(key: K, value: WorkspaceSettings[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const setCollateral = (index: number, patch: Partial<Collateral>) =>
    set("collateral", values.collateral.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  return (
    <section className="settings-panel">
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run("Settings saved", async () => {
            // Blank rows are placeholders the operator has not filled in yet.
            const payload = { ...values, collateral: values.collateral.filter((item) => item.name.trim()) };
            await api("/api/workspace", { method: "PUT", body: JSON.stringify(payload) });
            await refresh();
          });
        }}
      >
        <div className="settings-group">
          <h3 className="section-title">Sender</h3>
          <p className="policy-note">Every draft signs off with these details, so keep them current.</p>
          <div className="form-grid">
            <label className="field-row">
              <span>Company name</span>
              <input value={values.companyName} onChange={(event) => set("companyName", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Company website</span>
              <input value={values.companyWebsite} onChange={(event) => set("companyWebsite", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Your name</span>
              <input value={values.senderName} onChange={(event) => set("senderName", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Your title</span>
              <input value={values.senderTitle} onChange={(event) => set("senderTitle", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Reply-to email</span>
              <input type="email" value={values.senderEmail} onChange={(event) => set("senderEmail", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Contact phone</span>
              <input value={values.senderPhone} onChange={(event) => set("senderPhone", event.target.value)} />
            </label>
            <label className="field-row span-2">
              <span>Sign-off</span>
              <input value={values.signature} onChange={(event) => set("signature", event.target.value)} />
            </label>
          </div>
        </div>

        <div className="settings-group">
          <h3 className="section-title">Drafting</h3>
          <div className="form-grid">
            <label className="field-row">
              <span>Default market</span>
              <input value={values.defaultMarket} onChange={(event) => set("defaultMarket", event.target.value)} />
            </label>
            <label className="field-row">
              <span>Tone</span>
              <select value={values.tone} onChange={(event) => set("tone", event.target.value as WorkspaceSettings["tone"])}>
                <option value="consultative">Consultative</option>
                <option value="concise">Concise</option>
                <option value="technical">Technical</option>
              </select>
            </label>
            <label className="field-row">
              <span>Daily draft limit</span>
              {/* Matches settingsSchema.dailyDraftLimit in lib/validation.ts — keep these caps in sync. */}
              <input type="number" min={1} max={100} value={values.dailyDraftLimit} onChange={(event) => set("dailyDraftLimit", Number(event.target.value))} />
            </label>
            <label className="field-row">
              <span>Follow-up after (days)</span>
              {/* Matches settingsSchema.followUpDays in lib/validation.ts — keep these caps in sync. */}
              <input type="number" min={1} max={60} value={values.followUpDays} onChange={(event) => set("followUpDays", Number(event.target.value))} />
            </label>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={values.approvalRequired} onChange={(event) => set("approvalRequired", event.target.checked)} />
            <span>Require reviewer approval before a draft can be marked sent</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={values.publicDataOnly} onChange={(event) => set("publicDataOnly", event.target.checked)} />
            <span>Use publicly available business information only</span>
          </label>
          <p className="policy-note">Drafting model: {data.provider}</p>
        </div>

        <div className="settings-group">
          <h3 className="section-title">Collateral library</h3>
          <p className="policy-note">
            Brochures, catalogues, COA/MSDS and spec sheets. Drafts recommend the right one per message type and link to it
            from the inbox.
          </p>
          {values.collateral.map((item, index) => (
            <div className="form-grid collateral-row" key={index}>
              <label className="field-row">
                <span>Name</span>
                <input value={item.name} onChange={(event) => setCollateral(index, { name: event.target.value })} />
              </label>
              <label className="field-row">
                <span>Kind</span>
                <select value={item.kind} onChange={(event) => setCollateral(index, { kind: event.target.value as Collateral["kind"] })}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </label>
              <label className="field-row">
                <span>Link</span>
                <input value={item.url} onChange={(event) => setCollateral(index, { url: event.target.value })} placeholder="https://…" />
              </label>
              <button
                className="ghost-button"
                type="button"
                onClick={() => set("collateral", values.collateral.filter((_, position) => position !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="secondary-button"
            type="button"
            disabled={values.collateral.length >= 24}
            onClick={() => set("collateral", [...values.collateral, { name: "", kind: "brochure", url: "" }])}
          >
            Add collateral
          </button>
        </div>

        <button className="primary-button" type="submit" disabled={busy}>Save settings</button>
      </form>
    </section>
  );
}
