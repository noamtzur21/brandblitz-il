import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { verifyMetaSignedRequest } from "@/lib/integrations/metaSignedRequest";

function getSignedRequestFromBody(bodyText: string) {
  const params = new URLSearchParams(bodyText);
  return params.get("signed_request") || "";
}

function getAppUrl(req: Request) {
  const base = process.env.APP_URL?.trim();
  if (base) return base.replace(/\/+$/, "");
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const signedRequest = getSignedRequestFromBody(bodyText);
    if (!signedRequest) return NextResponse.json({ error: "missing signed_request" }, { status: 400 });

    const payload = verifyMetaSignedRequest<{ user_id?: string }>(signedRequest);
    const fbUserId = payload.user_id ? String(payload.user_id) : "";
    if (!fbUserId) return NextResponse.json({ error: "missing user_id" }, { status: 400 });

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
          metaDeletionRequestedAt: Date.now(),
          metaDeletionFbUserId: fbUserId,
        },
        { merge: true },
      );
    }

    const confirmationCode = crypto.randomBytes(10).toString("hex");
    await db.collection("metaDeletionRequests").doc(confirmationCode).set({
      fbUserId,
      privateIntegrationsDocId: doc?.id ?? null,
      createdAt: Date.now(),
    });

    const appUrl = getAppUrl(req);
    const url = `${appUrl}/data-deletion?code=${encodeURIComponent(confirmationCode)}`;
    return NextResponse.json({ url, confirmation_code: confirmationCode });
  } catch {
    return NextResponse.json({ url: `${getAppUrl(req)}/data-deletion`, confirmation_code: "unknown" });
  }
}

