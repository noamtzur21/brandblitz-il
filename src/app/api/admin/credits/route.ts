import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";

type Body = {
  uid?: string;
  delta?: number; // add/subtract
  set?: number; // set absolute
};

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  const uid = String(body?.uid ?? "").trim();
  if (!uid) return NextResponse.json({ error: "חסר uid" }, { status: 400 });

  const hasSet = typeof body?.set === "number" && Number.isFinite(body.set);
  const hasDelta = typeof body?.delta === "number" && Number.isFinite(body.delta);
  if (!hasSet && !hasDelta) {
    return NextResponse.json({ error: "חסר set או delta" }, { status: 400 });
  }

  const adminDb = getAdminDb();
  const creditsRef = adminDb.doc(`users/${uid}/credits/summary`);

  try {
    let newBalance = 0;
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(creditsRef);
      const current =
        snap.exists && typeof snap.get("balance") === "number" ? (snap.get("balance") as number) : 0;

      newBalance = hasSet ? Math.max(0, body!.set!) : Math.max(0, current + body!.delta!);
      tx.set(creditsRef, { balance: newBalance, updatedAt: Date.now() }, { merge: true });
    });

    return NextResponse.json({ ok: true, uid, balance: newBalance });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בעדכון קרדיטים" },
      { status: 500 },
    );
  }
}

