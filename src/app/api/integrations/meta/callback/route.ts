import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getMetaEnv, verifyMetaState, type MetaConnection } from "@/lib/integrations/meta";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text().catch(() => "");
  const json = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    const msg = (json as any)?.error?.message || `Meta request failed (${res.status})`;
    throw new Error(msg);
  }
  return json;
}

export async function GET(req: Request) {
  const env = getMetaEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const error = url.searchParams.get("error_message") || url.searchParams.get("error") || "";

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?meta=error&reason=${encodeURIComponent(error)}`, process.env.APP_URL || url.origin).toString(),
      { status: 302 },
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/settings?meta=error&reason=${encodeURIComponent("Missing code/state")}`, process.env.APP_URL || url.origin).toString(),
      { status: 302 },
    );
  }

  let uid = "";
  try {
    uid = verifyMetaState(state, env.stateSecret).uid;
  } catch {
    return NextResponse.redirect(
      new URL(`/settings?meta=error&reason=${encodeURIComponent("Invalid state")}`, process.env.APP_URL || url.origin).toString(),
      { status: 302 },
    );
  }

  try {
    // 1) Exchange code → short-lived user token
    const shortTok = await fetchJson<{ access_token: string; token_type?: string; expires_in?: number }>(
      `https://graph.facebook.com/${env.graphApiVersion}/oauth/access_token` +
        `?client_id=${encodeURIComponent(env.appId)}` +
        `&redirect_uri=${encodeURIComponent(env.redirectUrl)}` +
        `&client_secret=${encodeURIComponent(env.appSecret)}` +
        `&code=${encodeURIComponent(code)}`,
    );

    // 2) Exchange short → long-lived user token
    const longTok = await fetchJson<{ access_token: string; token_type?: string; expires_in?: number }>(
      `https://graph.facebook.com/${env.graphApiVersion}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(env.appId)}` +
        `&client_secret=${encodeURIComponent(env.appSecret)}` +
        `&fb_exchange_token=${encodeURIComponent(shortTok.access_token)}`,
    );
    const userAccessTokenLongLived = longTok.access_token;
    const expiresInSec = typeof longTok.expires_in === "number" ? longTok.expires_in : 60 * 24 * 60 * 60;
    const userTokenExpiresAt = Date.now() + expiresInSec * 1000;

    // 2.5) Get app-scoped FB user id for deauth/data deletion callbacks
    const me = await fetchJson<{ id?: string }>(
      `https://graph.facebook.com/${env.graphApiVersion}/me?fields=id&access_token=${encodeURIComponent(
        userAccessTokenLongLived,
      )}`,
    );
    const fbUserId = me?.id ? String(me.id) : "";
    if (!fbUserId) throw new Error("Meta: missing user id");

    // 3) Get pages (pick first with CREATE_CONTENT)
    const accounts = await fetchJson<{
      data?: Array<{ id: string; name?: string; access_token?: string; tasks?: string[] }>;
    }>(
      `https://graph.facebook.com/${env.graphApiVersion}/me/accounts?fields=id,name,access_token,tasks&access_token=${encodeURIComponent(
        userAccessTokenLongLived,
      )}`,
    );

    const pages = (accounts.data ?? []).filter((p) => p?.id && p?.access_token);
    const pick =
      pages.find((p) => (p.tasks ?? []).includes("CREATE_CONTENT")) ||
      pages[0];
    if (!pick?.id || !pick.access_token) {
      throw new Error("לא נמצאה הרשאה לעמוד פייסבוק (Page) עם CREATE_CONTENT. חבר/י עמוד פייסבוק לחשבון מטא.");
    }

    const pageId = pick.id;
    const pageName = pick.name ?? null;
    const pageAccessToken = pick.access_token;
    const pageTasks = pick.tasks ?? [];

    // 4) Get connected IG professional account from the page
    const pageInfo = await fetchJson<{ instagram_business_account?: { id?: string } }>(
      `https://graph.facebook.com/${env.graphApiVersion}/${encodeURIComponent(pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(
        pageAccessToken,
      )}`,
    );
    const igUserId = pageInfo?.instagram_business_account?.id || "";
    if (!igUserId) {
      throw new Error("לא נמצא חשבון אינסטגרם מקצועי שמחובר לעמוד הפייסבוק. צריך IG Professional שמחובר ל‑FB Page.");
    }

    // 5) Try to fetch IG username (optional)
    let igUsername: string | null = null;
    try {
      const igInfo = await fetchJson<{ username?: string }>(
        `https://graph.facebook.com/${env.graphApiVersion}/${encodeURIComponent(igUserId)}?fields=username&access_token=${encodeURIComponent(
          userAccessTokenLongLived,
        )}`,
      );
      igUsername = typeof igInfo.username === "string" ? igInfo.username : null;
    } catch {
      igUsername = null;
    }

    const db = getAdminDb();
    const ref = db.doc(`privateIntegrations/${uid}`);
    const now = Date.now();
    const connection: MetaConnection = {
      connectedAt: now,
      updatedAt: now,
      graphApiVersion: env.graphApiVersion,
      fbUserId,
      userAccessTokenLongLived,
      userTokenExpiresAt,
      pageId,
      pageName,
      pageAccessToken,
      pageTasks,
      igUserId,
      igUsername,
    };

    await ref.set({ meta: connection }, { merge: true });

    return NextResponse.redirect(
      new URL(`/settings?meta=connected`, process.env.APP_URL || url.origin).toString(),
      { status: 302 },
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Meta connect failed";
    return NextResponse.redirect(
      new URL(`/settings?meta=error&reason=${encodeURIComponent(reason)}`, process.env.APP_URL || url.origin).toString(),
      { status: 302 },
    );
  }
}

