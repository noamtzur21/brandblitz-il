import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import { getMetaEnv, type MetaConnection } from "@/lib/integrations/meta";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  const json = text ? (JSON.parse(text) as any) : null;
  if (!res.ok) {
    const msg = json?.error?.message || `Meta request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as T;
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const body = (await req.json().catch(() => null)) as { pageId?: string } | null;
    const pageId = String(body?.pageId ?? "").trim();
    if (!pageId) return NextResponse.json({ error: "חסר pageId" }, { status: 400 });

    const env = getMetaEnv();
    const db = getAdminDb();
    const ref = db.doc(`privateIntegrations/${uid}`);
    const snap = await ref.get();
    const meta = snap.exists ? (snap.get("meta") as MetaConnection | null) : null;
    if (!meta?.userAccessTokenLongLived) {
      return NextResponse.json({ error: "אין חיבור Meta פעיל" }, { status: 400 });
    }

    // Validate page belongs to user and get page access token
    const accounts = await fetchJson<{
      data?: Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }>;
    }>(
      `https://graph.facebook.com/${env.graphApiVersion}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(
        meta.userAccessTokenLongLived,
      )}`,
    );
    const page = (accounts.data ?? []).find((p) => String(p.id) === pageId);
    if (!page?.access_token) {
      return NextResponse.json({ error: "העמוד לא נמצא בחשבון או חסרה הרשאה" }, { status: 400 });
    }

    const pageAccessToken = String(page.access_token);
    const pageName = page.name ?? null;
    const pageTasks = Array.isArray(page.tasks) ? page.tasks : [];

    // Fetch IG business account for this page
    const pageInfo = await fetchJson<{ instagram_business_account?: { id?: string } }>(
      `https://graph.facebook.com/${env.graphApiVersion}/${encodeURIComponent(pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(
        pageAccessToken,
      )}`,
    );
    const igUserId = pageInfo?.instagram_business_account?.id ? String(pageInfo.instagram_business_account.id) : "";
    if (!igUserId) {
      return NextResponse.json(
        { error: "לעמוד שנבחר אין אינסטגרם מקצועי מחובר. חבר/י IG Professional ל‑Page הזה ואז נסה/י שוב." },
        { status: 400 },
      );
    }

    // Fetch IG username (optional)
    let igUsername: string | null = null;
    try {
      const igInfo = await fetchJson<{ username?: string }>(
        `https://graph.facebook.com/${env.graphApiVersion}/${encodeURIComponent(igUserId)}?fields=username&access_token=${encodeURIComponent(
          meta.userAccessTokenLongLived,
        )}`,
      );
      igUsername = typeof igInfo.username === "string" ? igInfo.username : null;
    } catch {
      igUsername = null;
    }

    await ref.set(
      {
        meta: {
          ...meta,
          updatedAt: Date.now(),
          pageId,
          pageName,
          pageAccessToken,
          pageTasks,
          igUserId,
          igUsername,
        },
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, pageId, pageName, igUserId, igUsername });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

