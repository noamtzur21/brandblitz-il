import { NextResponse } from "next/server";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import { createMetaState, getMetaEnv } from "@/lib/integrations/meta";

const DEFAULT_SCOPES = [
  // Instagram publishing
  "instagram_basic",
  "instagram_content_publish",
  // Pages publishing
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
];

export async function GET(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const env = getMetaEnv();

    const state = createMetaState(uid, env.stateSecret);
    const url = new URL(`https://www.facebook.com/${env.graphApiVersion}/dialog/oauth`);
    url.searchParams.set("client_id", env.appId);
    url.searchParams.set("redirect_uri", env.redirectUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", DEFAULT_SCOPES.join(","));
    url.searchParams.set("auth_type", "rerequest");

    return NextResponse.redirect(url.toString(), { status: 302 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const uid = await requireUserIdFromRequest(req);
    const env = getMetaEnv();

    const state = createMetaState(uid, env.stateSecret);
    const url = new URL(`https://www.facebook.com/${env.graphApiVersion}/dialog/oauth`);
    url.searchParams.set("client_id", env.appId);
    url.searchParams.set("redirect_uri", env.redirectUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", DEFAULT_SCOPES.join(","));
    url.searchParams.set("auth_type", "rerequest");

    return NextResponse.json({ url: url.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

