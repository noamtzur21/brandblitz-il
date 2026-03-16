import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";

export async function POST(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const db = getAdminDb();
    await db.doc(`privateIntegrations/${uid}`).set({ meta: null, metaDisconnectedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

