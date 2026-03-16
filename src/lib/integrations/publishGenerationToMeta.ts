import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { GenerationDoc } from "@/lib/types";
import { storeGeneratedAsset } from "@/lib/generatedAssetStore";
import { toShareJpeg } from "@/lib/images/watermark";

type Placement = "post" | "reels" | "story";
type Platform = "instagram" | "facebook";

export type Destination = { platform: Platform; placement: Placement };

function graphApiVersion() {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}

function isVideoUrl(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".mp4") || u.includes("video") || u.includes(".webm");
}

function formatCaptionWithHashtags(gen: GenerationDoc) {
  const cap = (gen.caption ?? "").trim();
  const tags = Array.isArray(gen.hashtags) ? gen.hashtags.map((t) => String(t).trim()).filter(Boolean) : [];
  return [cap, tags.length ? tags.join(" ") : ""].filter(Boolean).join("\n\n").trim();
}

function mapMetaErrorToHebrew(message: string, code: number | null, subcode: number | null) {
  const m = String(message || "");
  if (code === 190 || /oauth/i.test(m) || /access token/i.test(m)) {
    return "החיבור למטא פקע או לא תקין. היכנס/י ל'הגדרות משתמש' → 'חיבור אינסטגרם/פייסבוק' ולחץ/י 'חבר מחדש'.";
  }
  if (code === 10 || /permissions/i.test(m) || /(#200)/.test(m) || /not authorized/i.test(m)) {
    return "אין הרשאות מספיקות לפרסום. ודא/י שהאפליקציה במצב Live ושאישרו הרשאות (App Review) לפרסום.";
  }
  if (code != null) return `${m} (Meta code ${code}${subcode != null ? `/${subcode}` : ""})`;
  return m;
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
    throw new Error(mapMetaErrorToHebrew(rawMsg, code, sub));
  }
  return json as T;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function ensureShareImageJpeg(opts: { genId: string; url: string; uid: string }) {
  const db = getAdminDb();
  const genRef = db.doc(`generations/${opts.genId}`);
  const snap = await genRef.get();
  const existing = snap.exists ? (snap.get("shareJpegUrl") as string | undefined) : undefined;
  if (existing && typeof existing === "string" && existing.startsWith("http")) return existing;

  let logoUrl: string | null = null;
  try {
    const bk = await db.doc(`users/${opts.uid}/brandKit/settings`).get();
    logoUrl = bk.exists ? ((bk.get("logoUrl") as string | null) ?? null) : null;
  } catch {
    logoUrl = null;
  }

  const res = await fetch(opts.url);
  if (!res.ok) throw new Error("לא הצלחתי לקרוא את התמונה");
  const bytes = Buffer.from(await res.arrayBuffer());
  const jpegBytes = await toShareJpeg({ imageBytes: bytes, logoUrl });

  const shareUrl = await storeGeneratedAsset({
    kind: "images",
    genId: opts.genId,
    suffix: "-share",
    bytes: jpegBytes,
    mimeType: "image/jpeg",
  });
  await genRef.set({ shareJpegUrl: shareUrl, shareJpegUpdatedAt: Date.now() }, { merge: true });
  return shareUrl;
}

export async function publishGenerationToMeta(opts: {
  uid: string;
  genId: string;
  destination: Destination;
  resumeCreationId?: string | null;
}): Promise<
  | { ok: true; id: string; creationId?: string }
  | { ok: false; processing: true; creationId: string }
> {
  const db = getAdminDb();
  const genSnap = await db.doc(`generations/${opts.genId}`).get();
  if (!genSnap.exists) throw new Error("היצירה לא נמצאה");
  const gen = genSnap.data() as GenerationDoc;
  if (gen.userId !== opts.uid) throw new Error("אין הרשאה ליצירה זו");
  if (!gen.resultUrl) throw new Error("היצירה עדיין לא מוכנה");

  const metaSnap = await db.doc(`privateIntegrations/${opts.uid}`).get();
  const meta = metaSnap.exists ? (metaSnap.get("meta") as any) : null;
  if (!meta) throw new Error("אין חיבור לאינסטגרם/פייסבוק. חבר/י חשבון בהגדרות משתמש.");

  const caption = formatCaptionWithHashtags(gen);
  const isVideo = isVideoUrl(gen.resultUrl);

  const api = graphApiVersion();

  if (opts.destination.platform === "instagram") {
    const igUserId = String(meta.igUserId || "");
    const pageAccessToken = String(meta.pageAccessToken || "");
    if (!igUserId || !pageAccessToken) {
      throw new Error("חסר Page Access Token או IG User. היכנס/י להגדרות משתמש וחבר/י מחדש ובחר/י עמוד.");
    }
    if (opts.destination.placement === "reels" && !isVideo) throw new Error("רילס דורש וידאו.");
    if (opts.destination.placement === "post" && isVideo) throw new Error("פוסט אינסטגרם במסלול הזה תומך בתמונה.");

    const base = `https://graph.facebook.com/${api}/${encodeURIComponent(igUserId)}`;

    const publishContainer = async (creationId: string) => {
      const publishUrl = new URL(`${base}/media_publish`);
      publishUrl.searchParams.set("access_token", pageAccessToken);
      const published = await fetchJson<{ id: string }>(publishUrl.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creation_id: creationId }),
      });
      return published.id;
    };

    const getStatus = async (creationId: string) => {
      const st = await fetchJson<{ status_code?: string }>(
        `https://graph.facebook.com/${api}/${encodeURIComponent(creationId)}?fields=status_code&access_token=${encodeURIComponent(
          pageAccessToken,
        )}`,
      );
      return String(st.status_code || "").toUpperCase();
    };

    // Resume
    if (opts.resumeCreationId) {
      const code = await getStatus(opts.resumeCreationId);
      if (code === "FINISHED" || code === "PUBLISHED") {
        const id = await publishContainer(opts.resumeCreationId);
        return { ok: true, id, creationId: opts.resumeCreationId };
      }
      if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram: container status ${code}`);
      return { ok: false, processing: true, creationId: opts.resumeCreationId };
    }

    const mediaUrl = isVideo ? gen.resultUrl : await ensureShareImageJpeg({ genId: opts.genId, url: gen.resultUrl, uid: opts.uid });

    const containerPayload: Record<string, unknown> = {};
    if (isVideo) containerPayload.video_url = mediaUrl;
    else containerPayload.image_url = mediaUrl;
    if (opts.destination.placement === "reels") containerPayload.media_type = "REELS";
    if (opts.destination.placement === "story") containerPayload.media_type = "STORIES";
    if (caption) containerPayload.caption = caption;

    const created = await fetchJson<{ id: string }>(`${base}/media?access_token=${encodeURIComponent(pageAccessToken)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(containerPayload),
    });
    const creationId = created.id;
    if (!creationId) throw new Error("Instagram: failed to create container");

    // For videos: quick poll only; if still processing, let caller resume later.
    if ((opts.destination.placement === "reels" || opts.destination.placement === "story") && isVideo) {
      for (let i = 0; i < 6; i++) {
        const code = await getStatus(creationId);
        if (code === "FINISHED" || code === "PUBLISHED") {
          const id = await publishContainer(creationId);
          return { ok: true, id, creationId };
        }
        if (code === "ERROR" || code === "EXPIRED") throw new Error(`Instagram: container status ${code}`);
        await sleep(2000);
      }
      return { ok: false, processing: true, creationId };
    }

    const id = await publishContainer(creationId);
    return { ok: true, id, creationId };
  }

  // Facebook Page
  const pageId = String(meta.pageId || "");
  const pageAccessToken = String(meta.pageAccessToken || "");
  if (!pageId || !pageAccessToken) throw new Error("חסר Page Access Token. חבר/י מחדש בהגדרות.");
  if (opts.destination.placement === "reels") throw new Error("בפייסבוק אין Reels במסלול הזה.");

  if (opts.destination.placement === "story") {
    if (isVideo) {
      const start = await fetchJson<{ video_id?: string; upload_url?: string }>(
        `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/video_stories?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ upload_phase: "start" }),
        },
      );
      const videoId = start.video_id || "";
      const uploadUrl = start.upload_url || "";
      if (!videoId || !uploadUrl) throw new Error("Facebook: failed to start story upload");
      await fetchJson(uploadUrl, { method: "POST", headers: { file_url: gen.resultUrl } as any });
      const finish = await fetchJson<{ post_id?: string }>(
        `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/video_stories?access_token=${encodeURIComponent(pageAccessToken)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ upload_phase: "finish", video_id: videoId }),
        },
      );
      return { ok: true, id: finish.post_id || videoId };
    }
    const uploaded = await fetchJson<{ id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: gen.resultUrl, published: false }),
      },
    );
    const photoId = uploaded.id || "";
    if (!photoId) throw new Error("Facebook: failed to upload photo");
    const published = await fetchJson<{ post_id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photo_stories?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo_id: photoId }),
      },
    );
    return { ok: true, id: published.post_id || photoId };
  }

  // Page post
  if (isVideo) {
    const published = await fetchJson<{ id?: string }>(
      `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/videos?access_token=${encodeURIComponent(pageAccessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_url: gen.resultUrl, description: caption }),
      },
    );
    return { ok: true, id: published.id || "ok" };
  }
  const published = await fetchJson<{ id?: string; post_id?: string }>(
    `https://graph.facebook.com/${api}/${encodeURIComponent(pageId)}/photos?access_token=${encodeURIComponent(pageAccessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: gen.resultUrl, caption }),
    },
  );
  return { ok: true, id: published.post_id || published.id || "ok" };
}

