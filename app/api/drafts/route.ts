import { NextResponse } from "next/server";
import { getSql, jsonParam } from "@/lib/db";
import { draftGenerateSchema, draftPatchSchema, settingsSchema, type DraftAction } from "@/lib/validation";
import { toCampaign, toDraft, toLead } from "@/lib/mappers";
import { planDrafts } from "@/lib/drafting";
import { channelGate } from "@/lib/channels";
import { DEFAULT_SETTINGS, type Channel, type DraftStatus, type EmailStage } from "@/lib/types";
import { authenticateRequest, forbidden, hasRole, unauthorized, type AuthContext, type WorkspaceRole } from "@/lib/auth";

/** Actions that put a message in front of (or in the hands of) the prospect — the compliance gate must hold for these. */
const GATED_ACTIONS: DraftAction[] = ["approve", "mark_sent"];

export const maxDuration = 60;

/** How many leads to draft for at once when a model call is involved. */
const GENERATE_CONCURRENCY = 4;

const ACTION_ROLES: Record<DraftAction, WorkspaceRole[]> = {
  save: ["owner", "admin", "researcher", "reviewer", "sender"],
  approve: ["owner", "admin", "reviewer"],
  saved_to_drafts: ["owner", "admin", "reviewer", "sender"],
  mark_sent: ["owner", "admin", "reviewer", "sender"],
  record_reply: ["owner", "admin", "reviewer", "sender"],
  qualify: ["owner", "admin", "reviewer", "sender"],
  hold: ["owner", "admin", "reviewer", "sender"],
  reopen: ["owner", "admin", "reviewer"],
};

const ACTION_STATUS: Record<Exclude<DraftAction, "save">, DraftStatus> = {
  approve: "approved",
  saved_to_drafts: "saved_to_drafts",
  mark_sent: "sent",
  record_reply: "replied",
  qualify: "qualified",
  hold: "held",
  reopen: "needs_review",
};

/** Email funnel position implied by a draft action, per the spec's status list. */
const EMAIL_STAGE_BY_ACTION: Partial<Record<DraftAction, EmailStage>> = {
  approve: "approved",
  saved_to_drafts: "saved_to_drafts",
  mark_sent: "sent",
  record_reply: "opened_replied",
  qualify: "qualified",
};

async function loadSettings(workspaceId: string) {
  const sql = getSql();
  const [row] = await sql`SELECT payload FROM workspace_settings WHERE workspace_id = ${workspaceId} AND id = 'default'`;
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...((row?.payload ?? {}) as Record<string, unknown>) });
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

function addDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return unauthorized();
    const input = draftPatchSchema.parse(await request.json());
    if (!hasRole(auth, ACTION_ROLES[input.action])) return forbidden();

    const sql = getSql();
    const [existing] = await sql`SELECT * FROM drafts WHERE id = ${input.id} AND workspace_id = ${auth.workspaceId}`;
    if (!existing) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    // The UI only disables Approve/Mark sent when the gate blocks a lead — enforce
    // it here too, since a stale panel or a direct call must not bypass it.
    if (GATED_ACTIONS.includes(input.action) && existing.lead_id) {
      const [leadRow] = await sql`SELECT * FROM leads WHERE id = ${existing.lead_id} AND workspace_id = ${auth.workspaceId}`;
      const gate = leadRow ? channelGate(toLead(leadRow), existing.channel as Channel) : null;
      if (gate && !gate.allowed) {
        return NextResponse.json({ error: `Blocked: ${gate.reason}` }, { status: 409 });
      }
    }

    const status: DraftStatus =
      input.action === "save" ? (input.status ?? existing.status) : ACTION_STATUS[input.action];
    const now = new Date();
    const approvedAt = input.action === "approve" ? now : existing.approved_at;
    const approvedBy = input.action === "approve" ? auth.userId : existing.approved_by;
    const sentAt = input.action === "mark_sent" ? now : existing.sent_at;
    const sentBy = input.action === "mark_sent" ? auth.userId : existing.sent_by;
    const repliedAt = input.action === "record_reply" ? now : existing.replied_at;

    const [row] = await sql`UPDATE drafts SET
        body = ${input.body ?? existing.body},
        subject = ${input.subject ?? existing.subject},
        attachments = ${sql.json(jsonParam(input.attachments ?? existing.attachments))},
        status = ${status},
        reply_note = ${input.replyNote ?? existing.reply_note},
        approved_at = ${approvedAt}, approved_by = ${approvedBy},
        sent_at = ${sentAt}, sent_by = ${sentBy}, replied_at = ${repliedAt},
        updated_at = NOW()
      WHERE id = ${input.id} AND workspace_id = ${auth.workspaceId} RETURNING *`;
    const draft = toDraft(row);

    if (draft.leadId) {
      const emailStage = draft.channel === "email" ? EMAIL_STAGE_BY_ACTION[input.action] : undefined;
      if (input.action === "mark_sent") {
        await sql`UPDATE leads SET last_contacted_at = NOW(), status = 'contacted',
            email_stage = COALESCE(${emailStage ?? null}, email_stage), updated_at = NOW()
          WHERE id = ${draft.leadId} AND workspace_id = ${auth.workspaceId}`;
      } else if (input.action === "record_reply") {
        await sql`UPDATE leads SET replied_at = NOW(), status = 'replied',
            email_stage = COALESCE(${emailStage ?? null}, email_stage), updated_at = NOW()
          WHERE id = ${draft.leadId} AND workspace_id = ${auth.workspaceId}`;
      } else if (input.action === "qualify") {
        await sql`UPDATE leads SET status = 'qualified',
            email_stage = COALESCE(${emailStage ?? null}, email_stage), updated_at = NOW()
          WHERE id = ${draft.leadId} AND workspace_id = ${auth.workspaceId}`;
      } else if (emailStage) {
        await sql`UPDATE leads SET email_stage = ${emailStage}, updated_at = NOW()
          WHERE id = ${draft.leadId} AND workspace_id = ${auth.workspaceId}`;
      }
    }

    // Marking a message sent is the natural point to schedule the follow-up.
    let followUp = null;
    if (input.action === "mark_sent" && draft.leadId) {
      const days = input.followUpDays ?? (await loadSettings(auth.workspaceId)).followUpDays;
      const [created] = await sql`INSERT INTO follow_ups (id, workspace_id, campaign_id, lead_id, draft_id, channel, due_on, note, created_by)
        VALUES (${crypto.randomUUID()}, ${auth.workspaceId}, ${draft.campaignId}, ${draft.leadId}, ${draft.id},
          ${draft.channel}, ${addDays(days)}, ${`Follow up on ${draft.channel} message`}, ${auth.userId})
        RETURNING *`;
      followUp = created;
    }

    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'draft', ${draft.id}, ${input.action},
        ${sql.json(jsonParam({ channel: draft.channel, type: draft.type, status }))})`;

    return NextResponse.json({ draft, followUp: followUp ? { id: followUp.id } : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update draft";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Generate per-lead, per-channel drafts. Existing drafts are kept unless `regenerate`. */
export async function POST(request: Request) {
  try {
    const auth: AuthContext | null = await authenticateRequest(request);
    if (!auth) return unauthorized();
    if (!hasRole(auth, ["owner", "admin", "researcher"])) return forbidden();
    const input = draftGenerateSchema.parse(await request.json());
    const sql = getSql();

    const [campaignRow] = await sql`SELECT * FROM campaigns WHERE id = ${input.campaignId} AND workspace_id = ${auth.workspaceId}`;
    if (!campaignRow) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    const campaign = toCampaign(campaignRow);
    const settings = await loadSettings(auth.workspaceId);

    const leadRows = await sql`SELECT * FROM leads WHERE workspace_id = ${auth.workspaceId}
      AND campaign_id = ${input.campaignId} AND id IN ${sql(input.leadIds)}`;
    if (!leadRows.length) return NextResponse.json({ error: "No matching leads" }, { status: 404 });
    const leads = leadRows.map(toLead);

    const existingRows = await sql`SELECT id, lead_id, channel, type, status FROM drafts
      WHERE workspace_id = ${auth.workspaceId} AND lead_id IN ${sql(leads.map((lead) => lead.id))}`;
    const existingKeys = new Set(existingRows.map((row) => `${row.lead_id}:${row.channel}:${row.type}`));
    const existingStatus = new Map(existingRows.map((row) => [`${row.lead_id}:${row.channel}:${row.type}`, row.status as DraftStatus]));
    const FINAL_STATUSES: DraftStatus[] = ["sent", "replied", "qualified"];

    // Plan in small batches so a large selection does not fan out model calls.
    const planned: { leadId: string; plans: Awaited<ReturnType<typeof planDrafts>> }[] = [];
    for (let index = 0; index < leads.length; index += GENERATE_CONCURRENCY) {
      const batch = leads.slice(index, index + GENERATE_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (lead) => ({
          leadId: lead.id,
          plans: await planDrafts({ lead, campaign, settings, channels: input.channels, types: input.types }),
        })),
      );
      planned.push(...results);
    }

    let created = 0;
    let skipped = 0;
    const emailLeadIds: string[] = [];

    for (const entry of planned) {
      for (const plan of entry.plans) {
        const key = `${entry.leadId}:${plan.channel}:${plan.type}`;
        if (existingKeys.has(key)) {
          if (!input.regenerate) {
            skipped += 1;
            continue;
          }
          // Never overwrite something already sent or replied to — and never insert
          // a second draft alongside it either.
          const currentStatus = existingStatus.get(key);
          if (currentStatus && FINAL_STATUSES.includes(currentStatus)) {
            skipped += 1;
            continue;
          }
          await sql`DELETE FROM drafts WHERE workspace_id = ${auth.workspaceId} AND lead_id = ${entry.leadId}
            AND channel = ${plan.channel} AND type = ${plan.type}
            AND status NOT IN ('sent', 'replied', 'qualified')`;
        }
        await sql`INSERT INTO drafts (id, workspace_id, campaign_id, lead_id, channel, type, subject, body, status, attachments, sequence_step)
          VALUES (${crypto.randomUUID()}, ${auth.workspaceId}, ${campaign.id}, ${entry.leadId}, ${plan.channel},
            ${plan.type}, ${plan.subject}, ${plan.body}, ${plan.status}, ${sql.json(jsonParam(plan.attachments))}, ${plan.sequenceStep})`;
        existingKeys.add(key);
        created += 1;
        if (plan.channel === "email") emailLeadIds.push(entry.leadId);
      }
    }

    if (emailLeadIds.length) {
      await sql`UPDATE leads SET email_stage = 'draft_generated', updated_at = NOW()
        WHERE workspace_id = ${auth.workspaceId} AND id IN ${sql([...new Set(emailLeadIds)])}
          AND email_stage IN ('none', 'found', 'verified')`;
    }

    await sql`INSERT INTO activity_log (workspace_id, actor_user_id, entity_type, entity_id, action, metadata)
      VALUES (${auth.workspaceId}, ${auth.userId}, 'campaign', ${campaign.id}, 'drafts_generated',
        ${sql.json(jsonParam({ leads: leads.length, channels: input.channels, created, skipped }))})`;

    return NextResponse.json({ created, skipped, leads: leads.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate drafts";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
