import { config } from "./env";

export const SESSION_COOKIE = "crm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return atob(input.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toHex(sig);
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const payload = b64url(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(payload);
  if (!safeEqual(sig, expected)) return false;
  try {
    const { exp } = JSON.parse(fromB64url(payload)) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export function verifyPassword(input: string): boolean {
  const expected = config.appPassword;
  if (!expected) return false;
  return safeEqual(input, expected);
}

/**
 * Authorize an automation call (cron/Zapier). Accepts either a valid session
 * cookie or `Authorization: Bearer <CRON_SECRET>`.
 */
export async function isAuthorizedRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const secret = config.cronSecret;
  if (secret && auth?.startsWith("Bearer ")) {
    if (safeEqual(auth.slice(7), secret)) return true;
  }
  const cookie = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  return verifySessionToken(cookie);
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}
