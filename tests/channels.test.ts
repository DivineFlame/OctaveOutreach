import { describe, expect, it } from "vitest";
import {
  CHANNELS_BY_PRIORITY,
  channelGate,
  draftTypeLabel,
  openPlatformUrl,
  profileFor,
  whatsappDigits,
} from "../lib/channels";
import { CHANNELS } from "../lib/types";
import { makeLead } from "./fixtures";

describe("channel metadata", () => {
  it("orders the seven channels exactly as the spec prioritises them", () => {
    expect(CHANNELS_BY_PRIORITY.map((meta) => meta.id)).toEqual([
      "linkedin",
      "email",
      "whatsapp",
      "instagram",
      "facebook",
      "x",
      "youtube",
    ]);
    expect(CHANNELS_BY_PRIORITY).toHaveLength(CHANNELS.length);
  });

  it("labels every draft type it can generate", () => {
    for (const meta of CHANNELS_BY_PRIORITY) {
      expect(meta.draftTypes.length).toBeGreaterThan(0);
      for (const type of meta.draftTypes) {
        expect(draftTypeLabel(type)).not.toContain("_");
      }
    }
    // Unknown types degrade to a readable label rather than throwing.
    expect(draftTypeLabel("some_new_type")).toBe("some new type");
  });
});

describe("channelGate", () => {
  it("blocks Do Not Contact and opt-outs on every channel", () => {
    const dnc = makeLead({ doNotContact: true, doNotContactReason: "Asked to be removed" });
    const optedOut = makeLead({ consentStatus: "opted_out" });
    for (const channel of CHANNELS) {
      expect(channelGate(dnc, channel)).toEqual({ allowed: false, reason: "Asked to be removed" });
      expect(channelGate(optedOut, channel).allowed).toBe(false);
    }
  });

  it("requires an address before drafting email", () => {
    // Regression: email must not require a stored "profile" — the address is the
    // destination, whatever the lead's primary channel happens to be.
    expect(channelGate(makeLead({ channel: "instagram" }), "email").allowed).toBe(true);
    expect(channelGate(makeLead(), "email").allowed).toBe(true);
    expect(channelGate(makeLead({ email: "" }), "email")).toEqual({
      allowed: false,
      reason: "No email address on file",
    });
  });

  it("never allows WhatsApp to a personal, unclassified or unconsented number", () => {
    expect(channelGate(makeLead({ phone: "" }), "whatsapp").reason).toBe("No WhatsApp number on file");
    expect(channelGate(makeLead({ whatsappNumberType: "personal_unverified" }), "whatsapp").allowed).toBe(false);
    // A number with no classification is still blocked, even with consent recorded.
    expect(
      channelGate(makeLead({ whatsappNumberType: "unknown", consentStatus: "consented" }), "whatsapp").allowed,
    ).toBe(false);
    // Classified but with no recorded opt-in basis.
    expect(
      channelGate(makeLead({ whatsappNumberType: "business_public", consentStatus: "unknown" }), "whatsapp").allowed,
    ).toBe(false);
  });

  it("allows WhatsApp once the number is classified and consent is recorded", () => {
    const gate = channelGate(
      makeLead({
        whatsappNumberType: "business_public",
        consentStatus: "consented",
        consentBasis: "Published WhatsApp Business number on the company website",
      }),
      "whatsapp",
    );
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe("Published WhatsApp Business number on the company website");
  });

  it("requires a stored profile for Instagram, Facebook and X but not LinkedIn or YouTube", () => {
    const bare = makeLead({ profileUrl: "", profiles: {} });
    expect(channelGate(bare, "instagram").allowed).toBe(false);
    expect(channelGate(bare, "facebook").allowed).toBe(false);
    expect(channelGate(bare, "x").allowed).toBe(false);
    // LinkedIn falls back to a people search and YouTube is publishing, not outreach.
    expect(channelGate(bare, "linkedin").allowed).toBe(true);
    expect(channelGate(bare, "youtube").allowed).toBe(true);

    const withHandle = makeLead({ profiles: { instagram: "@botanicalhair" } });
    expect(channelGate(withHandle, "instagram").allowed).toBe(true);
  });
});

describe("profileFor", () => {
  it("prefers the per-channel profile and falls back to the legacy primary field", () => {
    const lead = makeLead({ channel: "instagram", profileUrl: "@legacy-handle", profiles: { linkedin: "https://li/x" } });
    expect(profileFor(lead, "linkedin")).toBe("https://li/x");
    expect(profileFor(lead, "instagram")).toBe("@legacy-handle");
    // The legacy field only applies to the lead's own primary channel.
    expect(profileFor(lead, "facebook")).toBe("");
  });
});

describe("openPlatformUrl", () => {
  it("falls back to a LinkedIn people search when no profile is stored", () => {
    const url = openPlatformUrl(makeLead({ profileUrl: "", profiles: {} }), "linkedin");
    expect(url).toContain("linkedin.com/search/results/people");
    expect(url).toContain("Vipin%20Kumar%20Dabur%20India");
  });

  it("builds Gmail, Outlook and mailto compose links with the draft prefilled", () => {
    const lead = makeLead();
    const draft = { subject: "Bulk carrier oils", body: "Hello Vipin," };
    expect(openPlatformUrl(lead, "email", draft, "gmail")).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1&to=vipin.kumar%40dabur.com&su=Bulk%20carrier%20oils&body=Hello%20Vipin%2C",
    );
    expect(openPlatformUrl(lead, "email", draft, "outlook")).toContain("outlook.office.com/mail/deeplink/compose");
    expect(openPlatformUrl(lead, "email", draft, "default")).toMatch(/^mailto:/);
    // No address means no destination — the caller falls back to the X-Ray builder.
    expect(openPlatformUrl(makeLead({ email: "" }), "email", draft)).toBe("");
  });

  it("builds a wa.me link from digits only", () => {
    expect(whatsappDigits("+91 (98100) 12345")).toBe("919810012345");
    expect(openPlatformUrl(makeLead(), "whatsapp", { body: "Hi there" })).toBe(
      "https://wa.me/919810012345?text=Hi%20there",
    );
    expect(openPlatformUrl(makeLead({ phone: "n/a" }), "whatsapp")).toBe("");
  });

  it("expands bare handles into profile URLs and keeps full URLs intact", () => {
    expect(openPlatformUrl(makeLead({ profiles: { instagram: "@botanicalhair" } }), "instagram")).toBe(
      "https://www.instagram.com/botanicalhair",
    );
    expect(openPlatformUrl(makeLead({ profiles: { facebook: "/MakinOils" } }), "facebook")).toBe(
      "https://www.facebook.com/MakinOils",
    );
    expect(openPlatformUrl(makeLead({ profiles: { x: "https://x.com/founder" } }), "x")).toBe("https://x.com/founder");
    expect(openPlatformUrl(makeLead(), "youtube")).toBe("https://studio.youtube.com");
  });
});
