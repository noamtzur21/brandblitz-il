import "server-only";

import crypto from "node:crypto";

export type MetaEnv = {
  appId: string;
  appSecret: string;
  clientToken: string;
  redirectUrl: string;
  graphApiVersion: string;
  stateSecret: string;
};

export function getMetaEnv(): MetaEnv {
  const appId = process.env.META_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || "";
  const clientToken = process.env.META_CLIENT_TOKEN || "";
  const stateSecret = process.env.META_STATE_SECRET || "";
  const graphApiVersion = process.env.META_GRAPH_API_VERSION || "v25.0";
  const redirectUrl =
    process.env.META_REDIRECT_URL ||
    (process.env.APP_URL ? new URL("/api/integrations/meta/callback", process.env.APP_URL).toString() : "");

  if (!appId) throw new Error("Missing META_APP_ID");
  if (!appSecret) throw new Error("Missing META_APP_SECRET");
  if (!clientToken) throw new Error("Missing META_CLIENT_TOKEN");
  if (!stateSecret) throw new Error("Missing META_STATE_SECRET");
  if (!redirectUrl) throw new Error("Missing META_REDIRECT_URL (or APP_URL)");

  return { appId, appSecret, clientToken, redirectUrl, graphApiVersion, stateSecret };
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function createMetaState(uid: string, stateSecret: string): string {
  const payload = {
    uid,
    ts: Date.now(),
    nonce: crypto.randomBytes(12).toString("hex"),
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", stateSecret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

export function verifyMetaState(
  state: string,
  stateSecret: string,
  maxAgeMs = 15 * 60 * 1000,
): { uid: string } {
  const [payloadB64, sig] = state.split(".", 2);
  if (!payloadB64 || !sig) throw new Error("Invalid state");
  const expected = crypto.createHmac("sha256", stateSecret).update(payloadB64).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
    throw new Error("Invalid state");
  }
  const raw = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as { uid?: string; ts?: number };
  if (!raw.uid || typeof raw.uid !== "string") throw new Error("Invalid state");
  if (!raw.ts || typeof raw.ts !== "number") throw new Error("Invalid state");
  if (Date.now() - raw.ts > maxAgeMs) throw new Error("State expired");
  return { uid: raw.uid };
}

export type MetaConnection = {
  connectedAt: number;
  updatedAt: number;
  graphApiVersion: string;

  /** App-scoped Facebook user id (from /me). Used for deauth/data deletion callbacks. */
  fbUserId: string;

  userAccessTokenLongLived: string;
  userTokenExpiresAt: number; // ms

  pageId: string;
  pageName: string | null;
  pageAccessToken: string;
  pageTasks: string[];

  igUserId: string;
  igUsername: string | null;
};

