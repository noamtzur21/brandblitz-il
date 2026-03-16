import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import type { GenerationDoc } from "@/lib/types";
import { publishGenerationToMeta } from "@/lib/integrations/publishGenerationToMeta";

export async function POST(req: Request) {
  let uid: string;
  try {
    uid = await requireUserIdFromRequest(req);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { genId?: string; decision?: "approve" | "reject" } | null;
  const genId = String(body?.genId ?? "").trim();
  const decision = body?.decision;
  if (!genId) return NextResponse.json({ error: "חסר genId" }, { status: 400 });
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision לא תקין" }, { status: 400 });
  }

  const db = getAdminDb();
  const genRef = db.doc(`generations/${genId}`);
  const genSnap = await genRef.get();
  if (!genSnap.exists) return NextResponse.json({ error: "היצירה לא נמצאה" }, { status: 404 });
  const gen = genSnap.data() as GenerationDoc;
  if (gen.userId !== uid) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });

  const au = (gen as any)?.autoUpload ?? null;
  if (!au?.scheduledPostId) return NextResponse.json({ error: "זו לא יצירה של העלאה אוטומטית" }, { status: 400 });
  if (String(au.status) !== "pending_approval" && String(au.status) !== "awaiting_approval") {
    return NextResponse.json({ error: "לא ממתין לאישור" }, { status: 409 });
  }

  const postRef = db.doc(`scheduledPosts/${String(au.scheduledPostId)}`);
  const postSnap = await postRef.get();
  const post = postSnap.exists ? (postSnap.data() as any) : null;
  const scheduledAt = post && typeof post.scheduledAt === "number" ? (post.scheduledAt as number) : 0;
  const now = Date.now();

  if (decision === "reject") {
    await postRef.set({ status: "rejected", updatedAt: Date.now() }, { merge: true });
    await genRef.set({ autoUpload: { ...au, status: "rejected" } }, { merge: true });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // approve -> if publish time is in the future, mark approved and let cron publish at scheduledAt
  if (scheduledAt && now < scheduledAt) {
    await postRef.set({ status: "approved", updatedAt: Date.now() }, { merge: true });
    await genRef.set({ autoUpload: { ...au, status: "approved" } }, { merge: true });
    return NextResponse.json({ ok: true, status: "approved" });
  }

  // approve and due -> publish now
  await postRef.set({ status: "publishing", updatedAt: Date.now() }, { merge: true });
  await genRef.set({ autoUpload: { ...au, status: "publishing" } }, { merge: true });

  const destination = { platform: au.platform, placement: au.placement } as any;
  const out = await publishGenerationToMeta({ uid, genId, destination });
  if (!out.ok && out.processing) {
    await postRef.set({ status: "publishing", metaCreationId: out.creationId, updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: false, processing: true });
  }

  await postRef.set({ status: "done", updatedAt: Date.now(), metaCreationId: null }, { merge: true });
  await genRef.set({ autoUpload: { ...au, status: "done" } }, { merge: true });
  return NextResponse.json({ ok: true, status: "done" });
}

