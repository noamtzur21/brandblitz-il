import "server-only";

import { getAdminAuth } from "@/lib/firebase/admin";

export async function requireUserIdFromRequest(req: Request): Promise<string> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Missing Authorization Bearer token");
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  if (!decoded?.uid) throw new Error("Unauthorized");
  return decoded.uid;
}

