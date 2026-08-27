import { z } from "zod";
import {
  CHANNELS,
  CONSENT_STATUSES,
  DRAFT_STATUSES,
  DRAFT_TYPES,
  FOLLOW_UP_STATUSES,
  EMAIL_STAGES,
  VERIFICATION_STATUSES,
  WHATSAPP_NUMBER_TYPES,
  type Channel,
} from "./types";

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  website: z.url().refine((url) => /^https?:\/\//i.test(url), "Only HTTP(S) websites are supported"),
  market: z.string().trim().min(2).max(80),
  leadGoal: z.coerce.number().int().min(1).max(500),
  channels: z.array(z.enum(CHANNELS)).min(1),
});

/** Optional email: either blank or a real address. */
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email address");

/**
 * `{ linkedin: "https://…", instagram: "@brand" }`. Unknown keys are dropped
 * rather than rejected so a wider import file still succeeds.
 */
const profilesSchema = z.record(z.string(), z.string().max(500)).transform((value) => {
  const profiles: Partial<Record<Channel, string>> = {};
  for (const channel of CHANNELS) {
    const url = value[channel]?.trim();
    if (url) profiles[channel] = url;
  }
  return profiles;
});

const leadFields = {
  company: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(160).default(""),
  role: z.string().trim().max(160).default(""),
  companyDomain: z.string().trim().max(200).default(""),
  industry: z.string().trim().max(120).default(""),
  location: z.string().trim().max(120).default(""),
  email: optionalEmail.default(""),
  phone: z.string().trim().max(40).default(""),
  channel: z.enum(CHANNELS).default("linkedin"),
  profileUrl: z.string().trim().max(500).default(""),
  profiles: profilesSchema.default({}),
  sourceUrl: z.string().trim().max(500).default(""),
  priority: z.enum(["A", "B", "C"]).default("B"),
  verificationStatus: z.enum(VERIFICATION_STATUSES).default("unverified"),
  verificationSource: z.string().trim().max(200).default(""),
  consentStatus: z.enum(CONSENT_STATUSES).default("unknown"),
  consentBasis: z.string().trim().max(300).default(""),
  whatsappNumberType: z.enum(WHATSAPP_NUMBER_TYPES).default("unknown"),
  emailStage: z.enum(EMAIL_STAGES).default("none"),
  doNotContact: z.boolean().default(false),
  doNotContactReason: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(2000).default(""),
};

export const leadInputSchema = z.object({
  campaignId: z.string().min(1),
  ...leadFields,
});

export const leadPatchSchema = z
  .object({
    id: z.string().min(1),
    company: leadFields.company.optional(),
    contactName: z.string().trim().max(160).optional(),
    role: z.string().trim().max(160).optional(),
    companyDomain: z.string().trim().max(200).optional(),
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(120).optional(),
    email: optionalEmail.optional(),
    phone: z.string().trim().max(40).optional(),
    channel: z.enum(CHANNELS).optional(),
    profileUrl: z.string().trim().max(500).optional(),
    profiles: profilesSchema.optional(),
    sourceUrl: z.string().trim().max(500).optional(),
    priority: z.enum(["A", "B", "C"]).optional(),
    verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
    verificationSource: z.string().trim().max(200).optional(),
    consentStatus: z.enum(CONSENT_STATUSES).optional(),
    consentBasis: z.string().trim().max(300).optional(),
    whatsappNumberType: z.enum(WHATSAPP_NUMBER_TYPES).optional(),
    emailStage: z.enum(EMAIL_STAGES).optional(),
    doNotContact: z.boolean().optional(),
    doNotContactReason: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z.string().trim().max(40).optional(),
  })
  .refine((value) => Object.keys(value).length > 1, "Nothing to update");

export const leadImportSchema = z.object({
  campaignId: z.string().min(1),
  /** Rows already normalised from CSV/XLSX headers by the import route. */
  rows: z.array(z.record(z.string(), z.string())).min(1).max(2000),
  defaultChannel: z.enum(CHANNELS).default("linkedin"),
});

/**
 * The eight per-channel actions from the spec. `review` and `open` are
 * client-side only; the rest change server state.
 */
export const DRAFT_ACTIONS = [
  "save",
  "approve",
  "saved_to_drafts",
  "mark_sent",
  "record_reply",
  "qualify",
  "hold",
  "reopen",
] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];

export const draftPatchSchema = z.object({
  id: z.string().min(1),
  action: z.enum(DRAFT_ACTIONS).default("save"),
  subject: z.string().max(300).optional(),
  body: z.string().max(10000).optional(),
  /** Only honoured by the `save` action; other actions derive their own status. */
  status: z.enum(DRAFT_STATUSES).optional(),
  attachments: z.array(z.string().max(200)).max(12).optional(),
  replyNote: z.string().max(2000).optional(),
  /** Optional reminder created alongside `mark_sent`. */
  followUpDays: z.coerce.number().int().min(1).max(180).optional(),
});

export const draftGenerateSchema = z.object({
  campaignId: z.string().min(1),
  leadIds: z.array(z.string().min(1)).min(1).max(40),
  channels: z.array(z.enum(CHANNELS)).min(1),
  types: z.array(z.enum(DRAFT_TYPES)).optional(),
  /** Replace existing drafts of the same channel and type instead of skipping. */
  regenerate: z.boolean().default(false),
});

export const followUpCreateSchema = z.object({
  leadId: z.string().min(1),
  draftId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  channel: z.enum(CHANNELS),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
  note: z.string().trim().max(500).default(""),
});

export const followUpPatchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(FOLLOW_UP_STATUSES),
});

export const collateralSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["brochure", "catalogue", "coa", "msds", "spec", "price_list", "other"]),
  url: z.string().trim().max(500).default(""),
});

export const settingsSchema = z.object({
  companyName: z.string().max(120),
  companyWebsite: z.string().max(500),
  senderName: z.string().max(120),
  senderTitle: z.string().max(120),
  senderEmail: z.string().max(254).default(""),
  senderPhone: z.string().max(40).default(""),
  defaultMarket: z.string().max(80),
  tone: z.enum(["consultative", "concise", "technical"]),
  dailyDraftLimit: z.coerce.number().int().min(1).max(100),
  followUpDays: z.coerce.number().int().min(1).max(60),
  approvalRequired: z.boolean(),
  publicDataOnly: z.boolean(),
  signature: z.string().max(1000),
  collateral: z.array(collateralSchema).max(24).default([]),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(12).max(256),
});
