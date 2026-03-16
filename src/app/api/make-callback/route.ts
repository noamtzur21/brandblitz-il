import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { BrandKitDoc, GenerationDoc, GenerationStatus } from "@/lib/types";
import { buildCloudinaryWatermarkedVideoUrl } from "@/lib/cloudinary";

type Body = {
  secret?: string;
  genId?: string;
  status?: GenerationStatus; // "done" or "error" expected from Make
  resultUrl?: string | null; // image/video url from Make
  caption?: string | null;
  overlayText?: string | null;
  errorMessage?: string | null;
  /** Remotion: "default" | "pop" | "dramatic" – from Gemini in Make; worker uses it or picks random */
  videoStyle?: string | null;
  /** Smart DJ: "energetic" | "calm" | "luxury" | "trendy" – from Gemini in Make; worker gets track from Jamendo API */
  audioVibe?: string | null;
  /** SFX URL from Make (e.g. module 5) – played when highlighted word pops in Remotion */
  sfxUrl?: string | null;
  /** User-uploaded image URLs (חומרי גלם). When sent by Make, Remotion uses these instead of single resultUrl. */
  sourceImageUrls?: string[] | null;
};

function getSecretFromRequest(req: Request, body: Body | null) {
  return (
    req.headers.get("x-callback-secret") ||
    body?.secret ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

export async function POST(req: Request) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  const expected = process.env.MAKE_CALLBACK_SECRET || "";
  const got = getSecretFromRequest(req, body);
  if (!expected || got !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const genId = String(body?.genId ?? "").trim();
  if (!genId) return NextResponse.json({ error: "חסר genId" }, { status: 400 });

  const adminDb = getAdminDb();
  const ref = adminDb.collection("generations").doc(genId);
  const snap = await ref.get();
  if (!snap.exists) {
    // eslint-disable-next-line no-console
    console.log("[make-callback] 404 genId לא ב-Firestore:", genId);
    return NextResponse.json({ error: "genId לא נמצא" }, { status: 404 });
  }

  const gen = snap.data() as GenerationDoc;
  const status = body?.status ?? (body?.errorMessage ? "error" : "done");

  if (status === "error") {
    await ref.set(
      {
        status: "error",
        errorMessage: body?.errorMessage ?? "שגיאה בתרחיש Make",
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true });
  }

  const OVERLAY_FALLBACK = "טקסט בעברית\nשכבה מונפשת";
  function looksLikePromptMeta(s: string): boolean {
    const lower = s.toLowerCase().trim();
    return (
      lower.includes("prompt") &&
      (lower.includes("negative") ||
        lower.includes("despicroptin") ||
        lower.includes("description"))
    );
  }
  function sanitizeOverlay(raw: string, caption: string | null): string {
    const t = (raw ?? "").trim();
    if (!t) return caption?.trim() || OVERLAY_FALLBACK;
    if (looksLikePromptMeta(t)) return caption?.trim() || OVERLAY_FALLBACK;
    const lines = t
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/BrandBlitz\s*IL/i.test(l));
    const out = lines.join("\n").trim();
    return out || caption?.trim() || OVERLAY_FALLBACK;
  }

  // Remotion pipeline: source = user uploads (חומרי גלם) or Make's resultUrl (Imagen).
  if (gen.type === "remotion") {
    const sourceImageUrls =
      Array.isArray(body?.sourceImageUrls) && body.sourceImageUrls.length > 0
        ? body.sourceImageUrls
        : (gen.sourceImageUrls ?? null);
    const sourceImageUrl =
      sourceImageUrls?.[0] ?? body?.resultUrl ?? gen.sourceImageUrl ?? null;
    const caption = body?.caption ?? gen.caption ?? null;
    const rawOverlay =
      body?.overlayText ?? gen.overlayText ?? OVERLAY_FALLBACK;
    const overlayText = sanitizeOverlay(rawOverlay, caption);
    const videoStyle =
      body?.videoStyle && ["default", "pop", "dramatic"].includes(body.videoStyle)
        ? body.videoStyle
        : null;
    const audioVibe =
      body?.audioVibe && ["energetic", "calm", "luxury", "trendy"].includes(body.audioVibe)
        ? body.audioVibe
        : null;
    const sfxUrl =
      body?.sfxUrl && typeof body.sfxUrl === "string" && body.sfxUrl.startsWith("http")
        ? body.sfxUrl
        : null;

    if (!sourceImageUrl) {
      await ref.set(
        { status: "error", errorMessage: "Missing resultUrl image for remotion render" },
        { merge: true },
      );
      return NextResponse.json({ ok: false, error: "Missing resultUrl" }, { status: 400 });
    }

    await ref.set(
      {
        status: "pending_review",
        sourceImageUrl,
        ...(sourceImageUrls ? { sourceImageUrls } : {}),
        caption,
        overlayText,
        ...(videoStyle ? { videoStyle } : {}),
        ...(audioVibe ? { audioVibe } : {}),
        ...(sfxUrl ? { sfxUrl } : {}),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, pendingReview: true });
  }

  // image/premium: just persist resultUrl + text (sanitize overlay so we never store prompt metadata)
  const captionImg = body?.caption ?? null;
  const rawOverlayImg = body?.overlayText ?? null;
  const overlayTextImg =
    rawOverlayImg != null ? sanitizeOverlay(rawOverlayImg, captionImg) : null;

  const rawResultUrl = body?.resultUrl ?? null;
  let finalResultUrl = rawResultUrl;

  // Premium: prefer a clean video + overlay logo via Cloudinary transformation (done in code, not in Make).
  // This avoids the "Veo makes a giant logo video" problem.
  if (gen.type === "premium" && rawResultUrl) {
    try {
      const brandKitSnap = await adminDb.doc(`users/${gen.userId}/brandKit/settings`).get();
      const brandKit = brandKitSnap.exists ? (brandKitSnap.data() as BrandKitDoc) : null;
      const logoUrl = brandKit?.logoUrl ?? null;
      if (logoUrl) {
        finalResultUrl =
          buildCloudinaryWatermarkedVideoUrl({
            videoUrl: rawResultUrl,
            logoUrl,
            relativeWidth: 0.16,
            marginPx: 26,
            gravity: "north_east",
          }) ?? rawResultUrl;
      }
    } catch {
      // If brand kit fetch fails, keep raw URL.
      finalResultUrl = rawResultUrl;
    }
  }

  await ref.set(
    {
      status: "done",
      resultUrl: finalResultUrl,
      ...(gen.type === "premium" ? { rawResultUrl } : {}),
      caption: captionImg,
      overlayText: overlayTextImg,
      errorMessage: null,
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true });
}

