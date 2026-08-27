export const CHANNELS = ["linkedin", "email", "whatsapp", "instagram", "facebook", "x", "youtube"] as const;
export type Channel = (typeof CHANNELS)[number];

export type CampaignStatus = "draft" | "analysing" | "ready" | "archived";

/**
 * Draft lifecycle. `saved_to_drafts` is email-only (the message sits in the
 * Gmail/Outlook drafts folder); every other value applies to any channel.
 */
export const DRAFT_STATUSES = [
  "needs_review",
  "approved",
  "ready",
  "waiting_consent",
  "held",
  "saved_to_drafts",
  "sent",
  "replied",
  "qualified",
] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/**
 * The "Draft type" column of the unified inbox. The last five entries are the
 * pre-003 values, kept so drafts created before per-lead drafting still render.
 */
export const DRAFT_TYPES = [
  "connection_note",
  "post_acceptance",
  "intro_email",
  "follow_up_email",
  "quotation",
  "rfq_response",
  "whatsapp_intro",
  "product_summary",
  "instagram_dm",
  "public_comment",
  "page_message",
  "enquiry_reply",
  "public_reply",
  "direct_message",
  "video_topic",
  "video_script",
  "connection",
  "message",
  "email",
  "post",
  "video",
] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

/**
 * WhatsApp number provenance. The agent refuses to draft for
 * `personal_unverified` — the spec forbids cold-messaging personal numbers.
 */
export const WHATSAPP_NUMBER_TYPES = [
  "unknown",
  "company_public",
  "business_public",
  "professional_direct",
  "personal_unverified",
] as const;
export type WhatsappNumberType = (typeof WHATSAPP_NUMBER_TYPES)[number];

/** Email funnel: found → verified → draft generated → … → qualified. */
export const EMAIL_STAGES = [
  "none",
  "found",
  "verified",
  "draft_generated",
  "approved",
  "saved_to_drafts",
  "sent",
  "opened_replied",
  "qualified",
] as const;
export type EmailStage = (typeof EMAIL_STAGES)[number];

export const VERIFICATION_STATUSES = ["unverified", "verified", "invalid", "risky"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CONSENT_STATUSES = ["unknown", "legitimate_interest", "consented", "opted_out"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const FOLLOW_UP_STATUSES = ["pending", "done", "cancelled"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export interface CampaignAnalysis {
  summary: string;
  products: string[];
  buyerSegments: string[];
  valuePropositions: string[];
  pitch: string;
  xrayStrings: string[];
}

export interface Campaign {
  id: string;
  name: string;
  website: string;
  market: string;
  leadGoal: number;
  channels: Channel[];
  status: CampaignStatus;
  analysis: CampaignAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  campaignId: string;
  company: string;
  contactName: string;
  role: string;
  companyDomain: string;
  industry: string;
  location: string;
  email: string;
  phone: string;
  /** Primary channel for this lead; drafts may still be generated per channel. */
  channel: Channel;
  profileUrl: string;
  /** Per-channel profile/page URL or handle, e.g. `{ linkedin: "https://…" }`. */
  profiles: Partial<Record<Channel, string>>;
  sourceUrl: string;
  status: string;
  priority: "A" | "B" | "C";
  verificationStatus: VerificationStatus;
  verificationSource: string;
  consentStatus: ConsentStatus;
  consentBasis: string;
  consentRecordedAt: string | null;
  whatsappNumberType: WhatsappNumberType;
  emailStage: EmailStage;
  doNotContact: boolean;
  doNotContactReason: string;
  notes: string;
  lastContactedAt: string | null;
  repliedAt: string | null;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

/** A brochure, catalogue, COA/MSDS or spec sheet a draft can recommend. */
export interface Collateral {
  name: string;
  kind: "brochure" | "catalogue" | "coa" | "msds" | "spec" | "price_list" | "other";
  url: string;
}

export interface Draft {
  id: string;
  campaignId: string;
  leadId: string | null;
  channel: Channel;
  type: DraftType;
  subject: string;
  body: string;
  status: DraftStatus;
  /** Names of recommended collateral, resolved against workspace settings. */
  attachments: string[];
  /** 1 for the opening message, 2+ for each follow-up in the sequence. */
  sequenceStep: number;
  approvedAt: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  replyNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  campaignId: string | null;
  leadId: string | null;
  draftId: string | null;
  channel: Channel;
  dueOn: string;
  note: string;
  status: FollowUpStatus;
  createdAt: string;
  completedAt: string | null;
}

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceSettings {
  companyName: string;
  companyWebsite: string;
  senderName: string;
  senderTitle: string;
  senderEmail: string;
  senderPhone: string;
  defaultMarket: string;
  tone: "consultative" | "concise" | "technical";
  dailyDraftLimit: number;
  followUpDays: number;
  approvalRequired: boolean;
  publicDataOnly: boolean;
  signature: string;
  collateral: Collateral[];
}

/** Applied when a workspace has never saved its settings. */
export const DEFAULT_SETTINGS: WorkspaceSettings = {
  companyName: "Octave",
  companyWebsite: "",
  senderName: "",
  senderTitle: "Business Development",
  senderEmail: "",
  senderPhone: "",
  defaultMarket: "India",
  tone: "consultative",
  dailyDraftLimit: 15,
  followUpDays: 7,
  approvalRequired: true,
  publicDataOnly: true,
  signature: "Regards",
  collateral: [],
};

export interface WorkspaceData {
  campaigns: Campaign[];
  leads: Lead[];
  drafts: Draft[];
  followUps: FollowUp[];
  activity: ActivityEntry[];
  settings: WorkspaceSettings;
}
