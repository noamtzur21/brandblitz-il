import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireUserIdFromRequest } from "@/lib/auth/requireUser";
import type { GenerationDoc } from "@/lib/types";
import { storeGeneratedAsset } from "@/lib/generatedAssetStore";
import { toShareJpeg } from "@/lib/images/watermark";

type Placement = "post" | "reels" | "story";
type Platform = "instagram" | "facebook";

type Body = {
  genId?: string;
  destination?: {
    platform?: Platform;
    placement?: Placement;
  };
  resume?: {
    creationId?: string;
  };
};

type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; message: string };

function isVideoUrl(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".mp4") || u.includes("video") || u.includes(".webm");
}

function formatCaptionWithHashtags(gen: GenerationDoc) {
  const cap = (gen.caption ?? "").trim();
  const tags = Array.isArray(gen.hashtags) ? gen.hashtags.map((t) => String(t).trim()).filter(Boolean) : [];
  return [cap, tags.length ? tags.join(" ") : ""].filter(Boolean).join("\n\n").trim();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  const json = text ? (JSON.parse(text) as any) : null;
  if (!res.ok) {
    const err = json?.error ?? null;
    const code = typeof err?.code === "number" ? err.code : null;
    const sub = typeof err?.error_subcode === "number" ? err.error_subcode : null;
    const rawMsg = err?.error_user_msg || err?.message || `Meta request failed (${res.status})`;
    const msg = mapMetaErrorToHebrew(rawMsg, code, sub);
    throw new Error(msg);
  }
  return json as T;
}

function mapMetaErrorToHebrew(message: string, code: number | null, subcode: number | null) {
  const m = String(message || "");
  // Common "token expired/invalid"
  if (code === 190 || /oauth/i.test(m) || /access token/i.test(m)) {
    return "החיבור למטא פקע או לא תקין. היכנס/י ל'הגדרות משתמש' → 'חיבור אינסטגרם/פייסבוק' ולחץ/י 'חבר מחדש'.";
  }
  // Permissions missing
  if (code === 10 || /permissions/i.test(m) || /(#200)/.test(m) || /not authorized/i.test(m)) {
    return "אין הרשאות מספיקות לפרסום. ודא/י שהאפליקציה במצב Live ושאישרו הרשאות (App Review) לפרסום.";
  }
  // IG account not connected / wrong page
  if (/instagram_business_account/i.test(m) || /No instagram/i.test(m)) {
    return "לעמוד שנבחר אין אינסטגרם מקצועי מחובר. בחר/י עמוד אחר בהגדרות או חבר/י IG Professional לעמוד.";
  }
  // Catch-all, keep original for debugging but readable
  if (code != null) {
    return `${m} (Meta code ${code}${subcode != null ? `/${subcode}` : ""})`;
  }
  return m;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function enforceQuickPostRateLimit(opts: {
  db: ReturnType<typeof getAdminDb>;
  uid: string;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;
  const MIN_MS = 60 * 1000;
  const MAX_PER_MIN = 3;
  const MAX_PER_HOUR = 30;

  const ref = opts.db.doc(`rateLimits/${opts.uid}/quickPost/state`);
  try {
    const out = await opts.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const raw = snap.exists ? (snap.get("events") as unknown) : null;
      const events = Array.isArray(raw) ? raw.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];

      const recentHour = events.filter((t) => now - t <= HOUR_MS);
      const recentMin = recentHour.filter((t) => now - t <= MIN_MS);

      if (recentMin.length >= MAX_PER_MIN) {
        const oldest = Math.min(...recentMin);
        const retryAfterSec = Math.max(1, Math.ceil((oldest + MIN_MS - now) / 1000));
        return { ok: false as const, retryAfterSec, message: "יותר מדי פרסומים בדקה. נסה/י שוב בעוד כמה שניות." };
      }
      if (recentHour.length >= MAX_PER_HOUR) {
        const oldest = Math.min(...recentHour);
        const retryAfterSec = Math.max(1, Math.ceil((oldest + HOUR_MS - now) / 1000));
        return { ok: false as const, retryAfterSec, message: "יותר מדי פרסומים בשעה. נסה/י שוב מאוחר יותר." };
      }

      const next = [...recentHour, now].sort((a, b) => a - b);
      tx.set(
        ref,
        { events: next, updatedAt: now },
        { merge: true },
      );
      return { ok: true as const };
    });
    return out;
  } catch {
    // Fail-open: don't block publishing if limiter store is temporarily unavailable.
    return { ok: true };
  }
}

async function getInstagramContainerStatus(opts: { creationId: string; accessToken: string }) {
  const api = "v25.0";
  return await fetchJson<{ status_code?: string }>(
    `https://graph.facebook.com/${api}/${encodeURIComponent(opts.creationId)}?fields=status_code&access_token=${encodeURIComponent(
      opts.accessToken,
    )}`,
  );
}

async function publishInstagramContainer(opts: { igUserId: string; accessToken: string; creationId: string }) {
  const api = "v25.0";
  const base = `https://graph.facebook.com/${api}/${encodeURIComponent(opts.igUserId)}`;
  const publishUrl = new URL(`${base}/media_publish`);
  publishUrl.searchParams.set("access_token", opts.accessToken);
  const published = await fetchJson<{ id: string }>(publishUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ creation_id: opts.creationId }),
  });
  return { id: published.id };
}

async function publishInstagram({
  igUserId,
  accessToken,
  placement,
  mediaUrl,
  isVideo,
  caption,
  resumeCreationId,
}: {
  igUserId: string;
  accessToken: string;
  placement: Placement;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
  resumeCreationId?: string | null;
}) {
  const api = "v25.0";
  const base = `https://graph.facebook.com/${api}/${encodeURIComponent(igUserId)}`;

  // Resume flow: check status and publish if ready.
  if (resumeCreationId) {
    const status = await getInstagramContainerStatus({ creationId: resumeCreationId, accessToken });
    const code = String(status.status_code || "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") {
      const published = await publishInstagramContainer({ igUserId, accessToken, creationId: resumeCreationId });
      return { id: published.id, creationId: resumeCreationId, processing: false as const };
    }
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram: container status ${code}`);
    }
    return { id: null as any, creationId: resumeCreationId, processing: true as const };
  }

  const containerUrl = new URL(`${base}/media`);
  containerUrl.searchParams.set("access_token", accessToken);

  const payload: Record<string, unknown> = {};
  if (isVideo) payload.video_url = mediaUrl;
  else payload.image_url = mediaUrl;

  if (placement === "reels") payload.media_type = "REELS";
  else if (placement === "story") payload.media_type = "STORIES";

  if (caption && placement !== "story") payload.caption = caption;
  if (caption && placement === "story") payload.caption = caption;

  const created = await fetchJson<{ id: string }>(containerUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const creationId = created.id;
  if (!creationId) throw new Error("Instagram: failed to create container");

  // For videos (reels/story), processing can take long. Avoid long server waits.
  if ((placement === "reels" || placement === "story") && isVideo) {
    // Quick poll window (<= ~12s). If still processing, return 202 to client to continue polling.
    for (let i = 0; i < 6; i++) {
      const status = await getInstagramContainerStatus({ creationId, accessToken });
      const code = String(status.status_code || "").toUpperCase();
      if (code === "FINISHED" || code === "PUBLISHED") {
        const published = await publishInstagramContainer({ igUserId, accessToken, creationId });
        return { id: published.id, creationId, processing: false as const };
      }
      if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram: container status ${code}`);
      await sleep(2000);
    }
    return { id: null as any, creationId, processing: true as const };
  }

  const published = await publishInstagramContainer({ igUserId, accessToken, creationId });
  return { id: published.id, creationId, processing: false as const };
}

async function publishFacebookPage({
  pageId,
  pageAccessToken,
  placement,
  mediaUrl,
  isVideo,
  caption,
}: {
  pageId: string;
  pageAccessToken: string;
  placement: Placement;
  mediaUrl: string;
  isVideo: boolean;
  caption: string;
}) {
  const api = "v25.0";
  if (placement === "story") {
    if (isVideo) {
      // Video story upload: start -> upload_url -> finish
      const start = await fetchJson<{ video_id?: string; upload_url?: string }>(
        `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/video_stories?access_token=${encodeURIComponent(
          pageAccessToken,
        )}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ upload_phase: "start" }),
        },
      );
      const videoId = start.video_id || "";
      const uploadUrl = start.upload_url || "";
      if (!videoId || !uploadUrl) throw new Error("Facebook: failed to start story upload");

      // Upload hosted file via header file_url
      await fetchJson<{ success?: boolean }>(uploadUrl, {
        method: "POST",
        headers: { file_url: mediaUrl } as any,
      });

      const finish = await fetchJson<{ success?: boolean; post_id?: string }>(
        `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/video_stories?access_token=${encodeURIComponent(
          pageAccessToken,
        )}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ upload_phase: "finish", video_id: videoId }),
        },
      );
      return { id: finish.post_id || null };
    }

    // Photo story: upload unpublished then publish
    const uploaded = await fetchJson<{ id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(
        pageAccessToken,
      )}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: mediaUrl, published: false }),
      },
    );
    const photoId = uploaded.id || "";
    if (!photoId) throw new Error("Facebook: failed to upload photo");
    const published = await fetchJson<{ success?: boolean; post_id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photo_stories?access_token=${encodeURIComponent(
        pageAccessToken,
      )}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo_id: photoId }),
      },
    );
    return { id: published.post_id || null };
  }

  // Page post
  if (isVideo) {
    // Best-effort: try page videos with file_url (may work depending on app access).
    const published = await fetchJson<{ id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/videos?access_token=${encodeURIComponent(
        pageAccessToken,
      )}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_url: mediaUrl, description: caption }),
      },
    );
    return { id: published.id || null };
  }

  const published = await fetchJson<{ id?: string; post_id?: string }>(
    `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(
      pageAccessToken,
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: mediaUrl, caption }),
    },
  );
  return { id: published.post_id || published.id || null };
}

async function ensureShareImageJpeg({
  genId,
  url,
  uid,
}: {
  genId: string;
  url: string;
  uid: string;
}): Promise<string> {
  const db = getAdminDb();
  const genRef = db.doc(`generations/${genId}`);
  const snap = await genRef.get();
  const existing = snap.exists ? (snap.get("shareJpegUrl") as string | undefined) : undefined;
  if (existing && typeof existing === "string" && existing.startsWith("http")) return existing;

  // Get optional logo from brand kit
  let logoUrl: string | null = null;
  try {
    const bk = await db.doc(`users/${uid}/brandKit/settings`).get();
    logoUrl = bk.exists ? ((bk.get("logoUrl") as string | null) ?? null) : null;
  } catch {
    logoUrl = null;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error("לא הצלחתי לקרוא את התמונה");
  const bytes = Buffer.from(await res.arrayBuffer());
  const jpegBytes = await toShareJpeg({ imageBytes: bytes, logoUrl });

  const shareUrl = await storeGeneratedAsset({
    kind: "images",
    genId,
    suffix: "-share",
    bytes: jpegBytes,
    mimeType: "image/jpeg",
  });

  await genRef.set({ shareJpegUrl: shareUrl, shareJpegUpdatedAt: Date.now() }, { merge: true });
  return shareUrl;
}

export async function POST(req: Request) {
  let uid: string;
  try {
    uid = await requireUserIdFromRequest(req);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  const genId = String(body?.genId ?? "").trim();
  const platform = body?.destination?.platform;
  const placement = body?.destination?.placement;
  const resumeCreationId =
    body?.resume?.creationId != null && String(body.resume.creationId).trim() !== ""
      ? String(body.resume.creationId).trim()
      : null;
  if (!genId) return NextResponse.json({ error: "חסר genId" }, { status: 400 });
  if (platform !== "instagram" && platform !== "facebook") {
    return NextResponse.json({ error: "platform לא תקין" }, { status: 400 });
  }
  if (placement !== "post" && placement !== "reels" && placement !== "story") {
    return NextResponse.json({ error: "placement לא תקין" }, { status: 400 });
  }

  const db = getAdminDb();

  // Rate limit only on initial publish attempt (not resume polling).
  if (!resumeCreationId) {
    const rl = await enforceQuickPostRateLimit({ db, uid });
    if (!rl.ok) {
      return NextResponse.json(
        { error: rl.message, retryAfterSec: rl.retryAfterSec },
        { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
      );
    }
  }

  const genSnap = await db.doc(`generations/${genId}`).get();
  if (!genSnap.exists) return NextResponse.json({ error: "היצירה לא נמצאה" }, { status: 404 });
  const gen = genSnap.data() as GenerationDoc;
  if (gen.userId !== uid) return NextResponse.json({ error: "אין הרשאה ליצירה זו" }, { status: 403 });
  if (!gen.resultUrl) return NextResponse.json({ error: "היצירה עדיין לא מוכנה" }, { status: 409 });

  const integrationSnap = await db.doc(`privateIntegrations/${uid}`).get();
  const meta = integrationSnap.exists ? (integrationSnap.get("meta") as any) : null;
  if (!meta?.pageAccessToken || !meta?.pageId || !meta?.igUserId || !meta?.userAccessTokenLongLived) {
    return NextResponse.json({ error: "אין חיבור לאינסטגרם/פייסבוק. חבר/י חשבון בהגדרות משתמש." }, { status: 400 });
  }

  const caption = formatCaptionWithHashtags(gen);
  const isVideo = isVideoUrl(gen.resultUrl);

  if (platform === "instagram") {
    if (!meta?.pageAccessToken) {
      return NextResponse.json(
        { error: "חסר Page Access Token. היכנס/י להגדרות משתמש → חיבור אינסטגרם/פייסבוק ובחר/י עמוד (או חבר/י מחדש)." },
        { status: 400 },
      );
    }
    if (placement === "reels" && !isVideo) {
      return NextResponse.json({ error: "רילס דורש וידאו. בחר/י פרסום פוסט/סטורי או צור/י וידאו." }, { status: 400 });
    }
    if (placement === "post" && isVideo) {
      return NextResponse.json({ error: "פוסט אינסטגרם במסלול הזה תומך בתמונה. בחר/י רילס/סטורי." }, { status: 400 });
    }
    const mediaUrl = isVideo ? gen.resultUrl : await ensureShareImageJpeg({ genId, url: gen.resultUrl, uid });
    const out = await publishInstagram({
      igUserId: String(meta.igUserId),
      accessToken: String(meta.pageAccessToken),
      placement,
      mediaUrl,
      isVideo,
      caption,
      resumeCreationId,
    });
    if (out.processing) {
      return NextResponse.json(
        {
          ok: false,
          processing: true,
          platform,
          placement,
          creationId: out.creationId,
          message: "אינסטגרם עדיין מעבד את המדיה. ממשיכים לבדוק עד שמוכן לפרסום…",
        },
        { status: 202 },
      );
    }
    return NextResponse.json({ ok: true, platform, placement, id: out.id, creationId: out.creationId });
  }

  // facebook
  if (placement === "reels") {
    return NextResponse.json({ error: "בפייסבוק אין Reels במסלול הזה. בחר/י פוסט או סטורי." }, { status: 400 });
  }
  const out = await publishFacebookPage({
    pageId: String(meta.pageId),
    pageAccessToken: String(meta.pageAccessToken),
    placement,
    mediaUrl: gen.resultUrl,
    isVideo,
    caption,
  });
  return NextResponse.json({ ok: true, platform, placement, id: out.id });
}

