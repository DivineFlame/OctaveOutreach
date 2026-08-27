export const CHANNELS = ["linkedin", "email", "whatsapp", "instagram", "facebook", "x", "youtube"] as const;
export type Channel = (typeof CHANNELS)[number];

export type CampaignStatus = "draft" | "analysing" | "ready" | "archived";
export type DraftStatus = "needs_review" | "approved" | "sent" | "replied" | "held";

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
  channel: Channel;
  profileUrl: string;
  sourceUrl: string;
  status: string;
  priority: "A" | "B" | "C";
  verificationStatus: "unverified" | "verified" | "invalid" | "risky";
  verificationSource: string;
  consentStatus: "unknown" | "legitimate_interest" | "consented" | "opted_out";
  doNotContact: boolean;
  notes: string;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  campaignId: string;
  leadId: string | null;
  channel: Channel;
  type: "connection" | "message" | "email" | "post" | "video";
  subject: string;
  body: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSettings {
  companyName: string;
  companyWebsite: string;
  senderName: string;
  senderTitle: string;
  defaultMarket: string;
  tone: "consultative" | "concise" | "technical";
  dailyDraftLimit: number;
  followUpDays: number;
  approvalRequired: boolean;
  publicDataOnly: boolean;
  signature: string;
}

export interface WorkspaceData {
  campaigns: Campaign[];
  leads: Lead[];
  drafts: Draft[];
  settings: WorkspaceSettings;
}
