import { describe, expect, it } from "vitest";
import { hashLoginKey, hashSessionToken, verifyPassword } from "../lib/auth";

const HASH = "scrypt$BwcHBwcHBwcHBwcHBwcHBw$5Vja6mOHpm7YQWFCfHSACROk9kngKXocnBJlmae6xAkEAMTetIMGaDAvL9p_FFY0IKMf0aizZMUhkBnOLsI2wg";

describe("authentication primitives", () => {
  it("verifies scrypt passwords without accepting a mismatch", async () => {
    await expect(verifyPassword("not-a-real-password", HASH)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", HASH)).resolves.toBe(false);
    await expect(verifyPassword("anything", "invalid")).resolves.toBe(false);
  });

  it("uses deterministic, purpose-specific SHA-256 hashes", () => {
    expect(hashSessionToken("token")).toHaveLength(64);
    expect(hashLoginKey("token")).toHaveLength(64);
    expect(hashSessionToken("token")).toBe(hashSessionToken("token"));
  });
});
