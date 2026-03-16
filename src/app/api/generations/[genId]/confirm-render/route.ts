import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import type { GenerationDoc } from "@/lib/types";

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

/**
 * POST /api/generations/[genId]/confirm-render
 * Preview & Edit: user confirmed (possibly edited) overlay text → set status to "rendering" so Worker picks up.
 * Body: { overlayText?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ genId: string }> },
) {
  const { genId } = await params;
  if (!genId) {
    return NextResponse.json({ error: "חסר מזהה יצירה" }, { status: 400 });
  }

  let userId: string;
  try {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
      return NextResponse.json(
        { error: "חסר Authorization Bearer token" },
        { status: 401 },
      );
    }
    userId = uid;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "אימות נכשל" },
      { status: 401 },
    );
  }

  let body: { overlayText?: string } = {};
  try {
    body = (await req.json()) as { overlayText?: string };
  } catch {
    // optional body
  }

  const adminDb = getAdminDb();
  const ref = adminDb.collection("generations").doc(genId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "היצירה לא נמצאה" }, { status: 404 });
  }

  const data = snap.data() as GenerationDoc;
  if (data.userId !== userId) {
    return NextResponse.json(
      { error: "אין הרשאה ליצירה זו" },
      { status: 403 },
    );
  }

  if (data.status !== "pending_review" || data.type !== "remotion") {
    return NextResponse.json(
      { error: "היצירה אינה במצב עריכה לפני רינדור (remotion + pending_review)" },
      { status: 400 },
    );
  }

  const overlayText =
    typeof body.overlayText === "string" && body.overlayText.trim()
      ? body.overlayText.trim()
      : (data.overlayText ?? "").trim() || "כותרת";

  await ref.set(
    {
      status: "rendering",
      overlayText,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, status: "rendering" });
}
