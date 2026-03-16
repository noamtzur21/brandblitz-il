import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";

export async function GET(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const db = getAdminDb();
    const snap = await db.doc(`privateIntegrations/${uid}`).get();
    const meta = snap.exists ? (snap.get("meta") as any) : null;
    if (!meta) return NextResponse.json({ connected: false });

    return NextResponse.json({
      connected: true,
      pageName: meta.pageName ?? null,
      pageId: meta.pageId ?? null,
      igUsername: meta.igUsername ?? null,
      igUserId: meta.igUserId ?? null,
      expiresAt: meta.userTokenExpiresAt ?? null,
      connectedAt: meta.connectedAt ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

