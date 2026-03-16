import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import { getMetaEnv } from "@/lib/integrations/meta";

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

export async function GET(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const env = getMetaEnv();
    const db = getAdminDb();
    const snap = await db.doc(`privateIntegrations/${uid}`).get();
    const meta = snap.exists ? (snap.get("meta") as any) : null;
    if (!meta?.userAccessTokenLongLived) {
      return NextResponse.json({ connected: false, pages: [] });
    }

    const userToken = String(meta.userAccessTokenLongLived);
    const accounts = await fetchJson<{
      data?: Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }>;
    }>(
      `https://graph.facebook.com/${env.graphApiVersion}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(
        userToken,
      )}`,
    );

    const pages = (accounts.data ?? [])
      .filter((p) => p?.id && p?.access_token)
      .slice(0, 50);

    const enriched = await Promise.all(
      pages.map(async (p) => {
        const pageId = p.id;
        const pageAccessToken = String(p.access_token);
        let igUserId: string | null = null;
        try {
          const pageInfo = await fetchJson<{ instagram_business_account?: { id?: string } }>(
            `https://graph.facebook.com/${env.graphApiVersion}/${encodeURIComponent(pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(
              pageAccessToken,
            )}`,
          );
          igUserId = pageInfo?.instagram_business_account?.id ? String(pageInfo.instagram_business_account.id) : null;
        } catch {
          igUserId = null;
        }
        return {
          pageId,
          pageName: p.name ?? null,
          tasks: Array.isArray(p.tasks) ? p.tasks : [],
          hasIg: !!igUserId,
          igUserId,
        };
      }),
    );

    return NextResponse.json({
      connected: true,
      current: {
        pageId: meta.pageId ?? null,
        igUserId: meta.igUserId ?? null,
      },
      pages: enriched,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

