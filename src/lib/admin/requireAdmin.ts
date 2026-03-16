import "server-only";

import { getAdminAuth } from "@/lib/firebase/admin";
import { getAdminDb } from "@/lib/firebase/admin";

export type AdminIdentity = {
  uid: string;
  email: string | null;
};

function parseCsvEnv(name: string): string[] {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdminByEnv(identity: AdminIdentity): boolean {
  const adminUids = parseCsvEnv("ADMIN_UIDS");
  if (adminUids.includes(identity.uid)) return true;

  const adminEmails = parseCsvEnv("ADMIN_EMAILS").map((e) => e.toLowerCase());
  const email = (identity.email ?? "").toLowerCase();
  if (email && adminEmails.includes(email)) return true;

  return false;
}

async function isAdminByFirestore(identity: AdminIdentity): Promise<boolean> {
  try {
    const db = getAdminDb();
    const ref = db.doc(`admins/${identity.uid}`);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const email = (identity.email ?? "").toLowerCase();
    const storedEmail = typeof snap.get("email") === "string" ? String(snap.get("email")).toLowerCase() : "";
    // If email is missing (some providers), allow by uid-only record.
    if (!email) return true;
    if (storedEmail && storedEmail === email) return true;
    // Backward compatibility: allow admin doc without email.
    if (!storedEmail) return true;
    return false;
  } catch {
    return false;
  }
}

export async function requireAdminFromRequest(req: Request): Promise<AdminIdentity> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error("Missing Authorization Bearer token");
  }
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  const identity: AdminIdentity = { uid: decoded.uid, email: decoded.email ?? null };
  const ok = isAdminByEnv(identity) || (await isAdminByFirestore(identity));
  if (!ok) {
    throw new Error("Forbidden");
  }
  return identity;
}

