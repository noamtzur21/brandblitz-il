import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import type { GenerationDoc } from "@/lib/types";

export async function POST(req: Request) {
  let uid: string;
  try {
    uid = await requireUserIdFromRequest(req);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "חסר id" }, { status: 400 });

  const db = getAdminDb();
  const postRef = db.doc(`scheduledPosts/${id}`);
  const snap = await postRef.get();
  if (!snap.exists) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  const post = snap.data() as any;
  if (String(post?.userId || "") !== uid) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const status = String(post?.status || "");
  if (status === "done") return NextResponse.json({ error: "כבר פורסם" }, { status: 409 });
  if (status === "publishing") return NextResponse.json({ error: "כבר בתהליך העלאה" }, { status: 409 });
  if (status === "cancelled") return NextResponse.json({ ok: true, status: "cancelled" });
  if (status === "rejected") return NextResponse.json({ error: "כבר נדחה" }, { status: 409 });

  const now = Date.now();
  await postRef.set(
    {
      status: "cancelled",
      lockedAt: null,
      metaCreationId: null,
      updatedAt: now,
    },
    { merge: true },
  );

  const genId = post?.generationId ? String(post.generationId) : "";
  if (genId) {
    const genRef = db.doc(`generations/${genId}`);
    const genSnap = await genRef.get();
    if (genSnap.exists) {
      const gen = genSnap.data() as GenerationDoc;
      if (gen.userId === uid && gen.autoUpload?.scheduledPostId === id) {
        await genRef.set({ autoUpload: { ...(gen.autoUpload ?? {}), status: "cancelled" } }, { merge: true });
      }
    }
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}

