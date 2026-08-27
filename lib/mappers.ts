import { jsonValue } from "./db";
import type {
  ActivityEntry,
  Campaign,
  Draft,
  FollowUp,
  Lead,
} from "./types";

type Row = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function isoOrNull(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** `DATE` columns come back as a Date; the UI wants a bare YYYY-MM-DD. */
function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
}

export function toCampaign(row: Row): Campaign {
  return {
    id: text(row.id),
    name: text(row.name),
    website: text(row.website),
    market: text(row.market),
    leadGoal: Number(row.lead_goal ?? 0),
    channels: jsonValue(row.channels, []),
    status: text(row.status) as Campaign["status"],
    analysis: jsonValue(row.analysis, null),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toLead(row: Row): Lead {
  return {
    id: text(row.id),
    campaignId: text(row.campaign_id),
    company: text(row.company),
    contactName: text(row.contact_name),
    role: text(row.role),
    companyDomain: text(row.company_domain),
    industry: text(row.industry),
    location: text(row.location),
    email: text(row.email),
    phone: text(row.phone),
    channel: text(row.channel) as Lead["channel"],
    profileUrl: text(row.profile_url),
    profiles: jsonValue(row.profiles, {}),
    sourceUrl: text(row.source_url),
    status: text(row.status),
    priority: (text(row.priority) || "B") as Lead["priority"],
    verificationStatus: (text(row.verification_status) || "unverified") as Lead["verificationStatus"],
    verificationSource: text(row.verification_source),
    consentStatus: (text(row.consent_status) || "unknown") as Lead["consentStatus"],
    consentBasis: text(row.consent_basis),
    consentRecordedAt: isoOrNull(row.consent_recorded_at),
    whatsappNumberType: (text(row.whatsapp_number_type) || "unknown") as Lead["whatsappNumberType"],
    emailStage: (text(row.email_stage) || "none") as Lead["emailStage"],
    doNotContact: Boolean(row.do_not_contact),
    doNotContactReason: text(row.do_not_contact_reason),
    notes: text(row.notes),
    lastContactedAt: isoOrNull(row.last_contacted_at),
    repliedAt: isoOrNull(row.replied_at),
    discoveredAt: iso(row.discovered_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toDraft(row: Row): Draft {
  return {
    id: text(row.id),
    campaignId: text(row.campaign_id),
    leadId: row.lead_id ? text(row.lead_id) : null,
    channel: text(row.channel) as Draft["channel"],
    type: text(row.type) as Draft["type"],
    subject: text(row.subject),
    body: text(row.body),
    status: (text(row.status) || "needs_review") as Draft["status"],
    attachments: jsonValue(row.attachments, []),
    sequenceStep: Number(row.sequence_step ?? 1),
    approvedAt: isoOrNull(row.approved_at),
    sentAt: isoOrNull(row.sent_at),
    repliedAt: isoOrNull(row.replied_at),
    replyNote: text(row.reply_note),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function toFollowUp(row: Row): FollowUp {
  return {
    id: text(row.id),
    campaignId: row.campaign_id ? text(row.campaign_id) : null,
    leadId: row.lead_id ? text(row.lead_id) : null,
    draftId: row.draft_id ? text(row.draft_id) : null,
    channel: text(row.channel) as FollowUp["channel"],
    dueOn: dateOnly(row.due_on),
    note: text(row.note),
    status: (text(row.status) || "pending") as FollowUp["status"],
    createdAt: iso(row.created_at),
    completedAt: isoOrNull(row.completed_at),
  };
}

export function toActivity(row: Row): ActivityEntry {
  return {
    id: text(row.id),
    entityType: text(row.entity_type),
    entityId: text(row.entity_id),
    action: text(row.action),
    actor: text(row.actor ?? ""),
    metadata: jsonValue(row.metadata, {}),
    createdAt: iso(row.created_at),
  };
}
