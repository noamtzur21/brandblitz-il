import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";

function numParam(u: URL, name: string, def: number) {
  const v = u.searchParams.get(name);
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export async function GET(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(100, numParam(url, "limit", 50)));
  const pageToken = url.searchParams.get("pageToken") || undefined;

  try {
    const auth = getAdminAuth();
    const db = getAdminDb();
    const res = await auth.listUsers(limit, pageToken);

    const creditRefs = res.users.map((u) => db.doc(`users/${u.uid}/credits/summary`));
    const creditSnaps = creditRefs.length > 0 ? await db.getAll(...creditRefs) : [];
    const creditsByUid = new Map<string, number>();
    for (const snap of creditSnaps) {
      const uid = snap.ref.path.split("/")[1] || "";
      const bal = snap.exists && typeof snap.get("balance") === "number" ? (snap.get("balance") as number) : 0;
      if (uid) creditsByUid.set(uid, bal);
    }

    return NextResponse.json({
      users: res.users.map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
        disabled: u.disabled ?? false,
        providerIds: (u.providerData ?? []).map((p) => p.providerId).filter(Boolean),
        credits: creditsByUid.get(u.uid) ?? 0,
      })),
      nextPageToken: res.pageToken ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list users" },
      { status: 500 },
    );
  }
}

