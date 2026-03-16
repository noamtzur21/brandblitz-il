import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";

export async function GET(req: Request) {
  try {
    const identity = await requireAdminFromRequest(req);
    // Ensure admin record exists in Firestore (so "everything is in Firebase").
    try {
      const db = getAdminDb();
      await db.doc(`admins/${identity.uid}`).set(
        {
          uid: identity.uid,
          email: identity.email ?? null,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    } catch {
      // ignore write failure
    }
    return NextResponse.json({ isAdmin: true, uid: identity.uid, email: identity.email ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ isAdmin: false, error: msg }, { status });
  }
}

