import { describe, expect, it } from "vitest";
import { campaignInputSchema, loginSchema, settingsSchema } from "../lib/validation";

describe("request validation", () => {
  it("accepts a valid campaign and rejects private protocols or no channels", () => {
    expect(campaignInputSchema.safeParse({ name: "US campaign", website: "https://example.com", market: "United States", leadGoal: 100, channels: ["linkedin", "email"] }).success).toBe(true);
    expect(campaignInputSchema.safeParse({ name: "US campaign", website: "file:///etc/passwd", market: "United States", leadGoal: 100, channels: [] }).success).toBe(false);
  });

  it("requires production-length credentials", () => {
    expect(loginSchema.safeParse({ username: "owner", password: "a-strong-password" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "owner", password: "short" }).success).toBe(false);
  });

  it("bounds operational limits", () => {
    const base = { companyName: "Octave", companyWebsite: "https://example.com", senderName: "Owner", senderTitle: "Director", defaultMarket: "India", tone: "consultative", dailyDraftLimit: 15, followUpDays: 7, approvalRequired: true, publicDataOnly: true, signature: "Regards" };
    expect(settingsSchema.safeParse(base).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, dailyDraftLimit: 1000 }).success).toBe(false);
  });
});
