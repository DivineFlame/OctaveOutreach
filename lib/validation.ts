import { z } from "zod";
import { CHANNELS } from "./types";

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  website: z.url().refine((url) => /^https?:\/\//i.test(url), "Only HTTP(S) websites are supported"),
  market: z.string().trim().min(2).max(80),
  leadGoal: z.coerce.number().int().min(1).max(500),
  channels: z.array(z.enum(CHANNELS)).min(1),
});

export const draftPatchSchema = z.object({
  id: z.string().min(1),
  body: z.string().max(10000).optional(),
  subject: z.string().max(300).optional(),
  status: z.enum(["needs_review", "approved", "sent", "replied", "held"]).optional(),
});

export const settingsSchema = z.object({
  companyName: z.string().max(120),
  companyWebsite: z.string().max(500),
  senderName: z.string().max(120),
  senderTitle: z.string().max(120),
  defaultMarket: z.string().max(80),
  tone: z.enum(["consultative", "concise", "technical"]),
  dailyDraftLimit: z.coerce.number().int().min(1).max(100),
  followUpDays: z.coerce.number().int().min(1).max(60),
  approvalRequired: z.boolean(),
  publicDataOnly: z.boolean(),
  signature: z.string().max(1000),
});

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(12).max(256),
});
