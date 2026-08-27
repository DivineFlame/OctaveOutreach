import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { leadInputSchema, leadPatchSchema } from "@/lib/validation";
import { toLead } from "@/lib/mappers";
import { channelGate } from "@/lib/channels";
import { authenticateRequest, forbidden, hasRole, unauthorized } from "@/lib/auth";
import type { Channel, Lead } from "@/lib/types";

/** `found` once an address exists, `verified` once it has been checked. */
function nextEmailStage(lead: Lead): Lead["emailStage"] {
  if (!lead.email) return "none";
  if (lead.emailStage === "none") return lead.verificationStatus === "verified" ? "verified" : "found";
  if (lead.emailStage === "found" && lead.verificationStatus === "verified") return "verified";
  return lead.emailStage;
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher"])) return forbidden();
    const input = leadInputSchema.parse(await request.json());
    const sql = getSql();

    const [campaign] = await sql`SELECT id FROM campaigns WHERE id = ${input.campaignId} AND workspace_id = ${auth.workspaceId}`;
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    // Same person twice in a campaign is the common import mistake; match on
    // email first, then on company plus contact name.
    const [duplicate] = input.email
      ? await sql`SELECT * FROM leads WHERE workspace_id = ${auth.workspaceId} AND campaign_id = ${input.campaignId}
            AND LOWER(email) = ${input.email.toLowerCase()} LIMIT 1`
      : await sql`SELECT * FROM leads WHERE workspace_id = ${auth.workspaceId} AND campaign_id = ${input.campaignId}
            AND LOWER(company) = ${input.company.toLowerCase()} AND LOWER(contact_name) = ${input.contactName.toLowerCase()} LIMIT 1`;
    if (duplicate) return NextResponse.json({ lead: toLead(duplicate), duplicate: true });

    const id = crypto.randomUUID();
    const emailStage = input.email ? (input.verificationStatus === "verified" ? "verified" : "found") : "none";
    const [row] = await sql`INSERT INTO leads (
        id, workspace_id, campaign_id, company, contact_name, role, company_domain, industry, location,
        email, phone, channel, profile_url, profiles, source_url, status, priority,
        verification_status, verification_source, consent_status, consent_basis, consent_recorded_at,
        whatsapp_number_type, email_stage, do_not_contact, do_not_contact_reason, notes
      ) VALUES (
        ${id}, ${auth.workspaceId}, ${input.campaignId}, ${input.company}, ${input.contactName}, ${input.role},
        ${input.companyDomain}, ${input.industry}, ${input.location}, ${input.email}, ${input.phone},
        ${input.channel}, ${input.profileUrl}, ${sql.json(jsonParam(input.profiles))}, ${input.sourceUrl},
        'new', ${input.priority}, ${input.verificationStatus}, ${input.verificationSource},
        ${input.consentStatus}, ${input.consentBasis}, ${input.consentBasis ? new Date() : null},
        ${input.whatsappNumberType}, ${emailStage}, ${input.doNotContact}, ${input.doNotContactReason}, ${input.notes}
      ) RETURNING *`;
    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'lead', ${id}, 'created', ${sql.json(jsonParam({ company: input.company, channel: input.channel }))})`;
    return NextResponse.json({ lead: toLead(row) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save lead";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher", "reviewer", "sender"])) return forbidden();
    const input = leadPatchSchema.parse(await request.json());
    const sql = getSql();
    const [existingRow] = await sql`SELECT * FROM leads WHERE id = ${input.id} AND workspace_id = ${auth.workspaceId}`;
    if (!existingRow) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const existing = toLead(existingRow);

    const merged: Lead = {
      ...existing,
      ...Object.fromEntries(Object.entries(input).filter(([key, value]) => key !== "id" && value !== undefined)),
    } as Lead;
    merged.profiles = input.profiles ?? existing.profiles;
    merged.emailStage = input.emailStage ?? nextEmailStage(merged);
    if (!merged.doNotContact) merged.doNotContactReason = input.doNotContactReason ?? "";
    const consentChanged = merged.consentBasis !== existing.consentBasis || merged.consentStatus !== existing.consentStatus;
    const consentRecordedAt = consentChanged && merged.consentBasis ? new Date() : existing.consentRecordedAt;

    const [row] = await sql`UPDATE leads SET
        company = ${merged.company}, contact_name = ${merged.contactName}, role = ${merged.role},
        company_domain = ${merged.companyDomain}, industry = ${merged.industry}, location = ${merged.location},
        email = ${merged.email}, phone = ${merged.phone}, channel = ${merged.channel},
        profile_url = ${merged.profileUrl}, profiles = ${sql.json(jsonParam(merged.profiles))},
        source_url = ${merged.sourceUrl}, status = ${merged.status}, priority = ${merged.priority},
        verification_status = ${merged.verificationStatus}, verification_source = ${merged.verificationSource},
        consent_status = ${merged.consentStatus}, consent_basis = ${merged.consentBasis},
        consent_recorded_at = ${consentRecordedAt ? new Date(consentRecordedAt) : null},
        whatsapp_number_type = ${merged.whatsappNumberType}, email_stage = ${merged.emailStage},
        do_not_contact = ${merged.doNotContact}, do_not_contact_reason = ${merged.doNotContactReason},
        notes = ${merged.notes}, updated_at = NOW()
      WHERE id = ${input.id} AND workspace_id = ${auth.workspaceId} RETURNING *`;
    const lead = toLead(row);

    // Re-check every open draft against the compliance gate, not just on a
    // Do Not Contact flip — an opt-out or a revoked consent basis must hold
    // drafts just as reliably, on whichever channel it affects.
    const openDrafts = await sql`SELECT id, channel, status FROM drafts
      WHERE workspace_id = ${auth.workspaceId} AND lead_id = ${lead.id}
        AND status IN ('needs_review', 'approved', 'ready', 'waiting_consent', 'saved_to_drafts')`;
    for (const draftRow of openDrafts) {
      const gate = channelGate(lead, draftRow.channel as Channel);
      if (!gate.allowed) {
        await sql`UPDATE drafts SET status = 'held', updated_at = NOW() WHERE id = ${draftRow.id}`;
      } else if (draftRow.status === "waiting_consent") {
        await sql`UPDATE drafts SET status = 'needs_review', updated_at = NOW() WHERE id = ${draftRow.id}`;
      }
    }

    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'lead', ${lead.id},
        ${lead.doNotContact && !existing.doNotContact ? "do_not_contact" : "updated"},
        ${sql.json(jsonParam({ company: lead.company, consentStatus: lead.consentStatus, emailStage: lead.emailStage }))})`;
    return NextResponse.json({ lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update lead";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
