import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signHmacSha256,
  verifyHmacSha256,
  randomToken,
} from "../netlify/lib/crypto";
import { generateLeadMagnetPdf } from "../netlify/lib/pdf";
import { createMemoryBlobStorage } from "../netlify/lib/storage";

describe("crypto helpers", () => {
  it("hashes and verifies passwords with unique salts", () => {
    const hash1 = hashPassword("super-secret-pass");
    const hash2 = hashPassword("super-secret-pass");
    expect(hash1).not.toEqual(hash2);
    expect(verifyPassword("super-secret-pass", hash1)).toBe(true);
    expect(verifyPassword("wrong-pass", hash1)).toBe(false);
  });

  it("signs and verifies HMAC-SHA256 webhook signatures", () => {
    const payload = JSON.stringify({ id: "sub_123", email: "ada@example.com" });
    const sig = signHmacSha256("whsec_test_secret", payload);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyHmacSha256("whsec_test_secret", payload, sig)).toBe(true);
    expect(verifyHmacSha256("wrong_secret", payload, sig)).toBe(false);
    expect(verifyHmacSha256("whsec_test_secret", payload + " ", sig)).toBe(false);
  });

  it("generates cryptographically random tokens", () => {
    const a = randomToken(16);
    const b = randomToken(16);
    expect(a).toHaveLength(32);
    expect(a).not.toEqual(b);
  });
});

describe("PDF lead magnet generator", () => {
  it("creates a valid PDF 1.4 binary containing title and discount code", () => {
    const bytes = generateLeadMagnetPdf({
      title: "Static-Stack Conversion Playbook",
      subtitle: "Prepared for ada@example.com",
      discountCode: "BEAM20",
      lines: [
        "1. Replace paywalled forms with drop-in POST endpoints.",
        "2. Attach lead magnets automatically on submit.",
      ],
    });
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("Static-Stack Conversion Playbook");
    expect(text).toContain("BEAM20");
    expect(bytes.byteLength).toBeGreaterThan(350);
  });
});

describe("memory blob storage", () => {
  it("stores, reads, and deletes binary blobs with metadata", async () => {
    const store = createMemoryBlobStorage();
    const content = new TextEncoder().encode("hello-pdf-bytes");
    await store.put("leads/guide.pdf", content, {
      contentType: "application/pdf",
      filename: "guide.pdf",
    });

    const loaded = await store.get("leads/guide.pdf");
    expect(loaded).not.toBeNull();
    expect(loaded?.metadata.contentType).toBe("application/pdf");
    expect(loaded?.metadata.filename).toBe("guide.pdf");
    expect(new TextDecoder().decode(loaded?.data)).toBe("hello-pdf-bytes");

    await store.delete("leads/guide.pdf");
    expect(await store.get("leads/guide.pdf")).toBeNull();
  });
});
