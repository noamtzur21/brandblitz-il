import "server-only";

import crypto from "node:crypto";
import { getMetaEnv } from "@/lib/integrations/meta";

function base64UrlDecodeToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function verifyMetaSignedRequest<T = any>(signedRequest: string): T {
  const env = getMetaEnv();
  const parts = String(signedRequest || "").split(".", 2);
  if (parts.length !== 2) throw new Error("Invalid signed_request");
  const sig = base64UrlDecodeToBuffer(parts[0]!);
  const payloadB64 = parts[1]!;
  const payloadBuf = base64UrlDecodeToBuffer(payloadB64);
  const payload = JSON.parse(payloadBuf.toString("utf8")) as { algorithm?: string } & Record<string, unknown>;

  const algo = String(payload.algorithm || "").toUpperCase();
  if (algo !== "HMAC-SHA256") throw new Error("Unsupported algorithm");

  const expected = crypto.createHmac("sha256", env.appSecret).update(payloadB64).digest();
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    throw new Error("Invalid signature");
  }
  return payload as T;
}

