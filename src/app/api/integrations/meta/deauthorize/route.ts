import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyMetaSignedRequest } from "@/lib/integrations/metaSignedRequest";

function getSignedRequestFromBody(bodyText: string) {
  const params = new URLSearchParams(bodyText);
  return params.get("signed_request") || "";
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const signedRequest = getSignedRequestFromBody(bodyText);
    if (!signedRequest) return NextResponse.json({ ok: false }, { status: 400 });

    const payload = verifyMetaSignedRequest<{ user_id?: string }>(signedRequest);
    const fbUserId = payload.user_id ? String(payload.user_id) : "";
    if (!fbUserId) return NextResponse.json({ ok: false }, { status: 400 });

    const db = getAdminDb();
    const snap = await db
      .collection("privateIntegrations")
      .where("meta.fbUserId", "==", fbUserId)
      .limit(1)
      .get();
    const doc = snap.docs[0];
    if (doc) {
      await doc.ref.set(
        {
          meta: null,
          metaDeauthorizedAt: Date.now(),
          metaDeauthorizedFbUserId: fbUserId,
        },
        { merge: true },
      );
    }

    // Meta expects 200 OK.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

