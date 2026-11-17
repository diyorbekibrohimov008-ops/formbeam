import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function randomToken(byteLength = 24): string {
  return randomBytes(byteLength).toString("hex");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const actualBuf = scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, "hex");
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

export function signHmacSha256(secret: string, payload: string): string {
  const hex = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `sha256=${hex}`;
}

export function verifyHmacSha256(secret: string, payload: string, signature: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected = signHmacSha256(secret, payload);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signSessionCookie(token: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(token, "utf8").digest("hex");
  return `${token}.${sig}`;
}

export function verifySessionCookie(cookieValue: string, secret: string): string | null {
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(token, "utf8").digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}
