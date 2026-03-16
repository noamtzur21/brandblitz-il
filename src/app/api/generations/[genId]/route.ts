import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ genId: string }> },
) {
  const { genId } = await params;
  if (!genId) {
    return NextResponse.json({ error: "חסר מזהה יצירה" }, { status: 400 });
  }

  let userId: string;
  try {
    const uid = await getUserIdFromRequest(_req);
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

  const db = getAdminDb();
  const ref = db.collection("generations").doc(genId);
  const snap = await ref.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "היצירה לא נמצאה" }, { status: 404 });
  }

  const data = snap.data();
  if (data?.userId !== userId) {
    return NextResponse.json(
      { error: "אין הרשאה למחוק יצירה זו" },
      { status: 403 },
    );
  }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
