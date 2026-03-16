import { NextResponse } from "next/server";
import type { GenerationType } from "@/lib/credits";
import { CREDIT_COST } from "@/lib/credits";
import type { BrandKitDoc, GenerationDoc } from "@/lib/types";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { geminiGenerateBrief } from "@/lib/vertex/gemini";
import { imagenGenerateMany } from "@/lib/vertex/imagen";
import { storeGeneratedAsset } from "@/lib/generatedAssetStore";
import { watermarkImageWithLogo } from "@/lib/images/watermark";

const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && ASPECT_RATIOS.includes(v as AspectRatio);
}

type Body = {
  niche?: string;
  userRequest?: string | null;
  type?: GenerationType;
  logoUrl?: string | null;
  aspectRatio?: string | null; // "9:16" | "1:1" | "16:9" – for Make/Imagen
  userId?: string | null; // fallback dev mode
  /** חומרי גלם: URLs of user-uploaded images. Sent to Make (Gemini Vision + Imagen fallback); stored as sourceImageUrls. */
  uploadedImageUrls?: string[] | null;
  /** Premium: video style (ugc_viral | cinematic | business_professional | product_showcase | lifestyle | custom). Sent to Make. */
  selectedStyle?: string | null;
  /** Premium: custom style description when selectedStyle === "custom". Sent to Make. */
  customPrompt?: string | null;
};

function isGenerationType(v: unknown): v is GenerationType {
  return v === "image" || v === "remotion" || v === "premium";
}

async function tryVerifyUserIdFromAuthHeader(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  // If admin env is not configured, verification will throw.
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

async function fetchFirstUploadAsVisionInput(uploadedImageUrls: string[] | null): Promise<{
  bytesBase64: string;
  mimeType: string;
} | null> {
  const url = uploadedImageUrls?.[0];
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { bytesBase64: buf.toString("base64"), mimeType };
}

export async function POST(req: Request) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  const niche = (body?.niche ?? "").trim();
  const userRequest =
    body?.userRequest != null && String(body.userRequest).trim() !== ""
      ? String(body.userRequest).trim()
      : null;
  const type = body?.type;
  const logoUrl = (body?.logoUrl ?? null) ? String(body?.logoUrl) : null;
  const aspectRatio = isAspectRatio(body?.aspectRatio)
    ? body.aspectRatio
    : "9:16";
  const uploadedImageUrls =
    Array.isArray(body?.uploadedImageUrls) &&
    body.uploadedImageUrls.length > 0 &&
    body.uploadedImageUrls.every((u) => typeof u === "string" && u.startsWith("http"))
      ? body.uploadedImageUrls
      : null;

  const selectedStyle =
    type === "premium" && body?.selectedStyle != null && String(body.selectedStyle).trim() !== ""
      ? String(body.selectedStyle).trim()
      : null;
  const customPrompt =
    type === "premium" && body?.customPrompt != null ? String(body.customPrompt).trim() : "";

  if (!niche) return NextResponse.json({ error: "חסר niche" }, { status: 400 });
  if (!isGenerationType(type)) return NextResponse.json({ error: "type לא תקין" }, { status: 400 });
  if (type === "premium" && !selectedStyle) {
    return NextResponse.json({ error: "במסלול פרימיום נדרש לבחור סגנון וידאו (selectedStyle)" }, { status: 400 });
  }

  const cost = CREDIT_COST[type];

  let adminDb: ReturnType<typeof getAdminDb>;
  try {
    adminDb = getAdminDb();
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Firebase Admin init failed";
    return NextResponse.json(
      {
        error:
          `Firebase Admin לא זמין (${msg}). הגדר FIREBASE_ADMIN_* או השתמש ב-ADC מקומית (gcloud auth application-default login / GOOGLE_APPLICATION_CREDENTIALS).`,
      },
      { status: 501 },
    );
  }

  let userId: string | null = null;
  try {
    userId = await tryVerifyUserIdFromAuthHeader(req);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "אימות נכשל" },
      { status: 401 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: "חסר Authorization Bearer token" },
      { status: 401 },
    );
  }

  // credits doc path: users/{uid}/credits/summary
  const creditsRef = adminDb.doc(`users/${userId}/credits/summary`);
  const genRef = adminDb.collection("generations").doc();
  const genId = genRef.id;

  try {
    await adminDb.runTransaction(async (tx) => {
      const creditsSnap = await tx.get(creditsRef);
      const balance =
        creditsSnap.exists && typeof creditsSnap.get("balance") === "number"
          ? (creditsSnap.get("balance") as number)
          : 30;

      if (balance < cost) {
        throw new Error("אין מספיק קרדיטים");
      }

      tx.set(
        creditsRef,
        { balance: balance - cost, updatedAt: Date.now() },
        { merge: true },
      );

      const genDoc: GenerationDoc = {
        userId,
        niche,
        ...(userRequest ? { userRequest } : {}),
        type,
        logoUrl,
        status: "processing",
        createdAt: Date.now(),
        resultUrl: null,
        caption: null,
        hashtags: null,
        overlayText: null,
        errorMessage: null,
        aspectRatio,
        ...(uploadedImageUrls?.length
          ? {
              sourceImageUrls: uploadedImageUrls,
              sourceImageUrl: uploadedImageUrls[0] ?? null,
            }
          : {}),
      };
      tx.set(genRef, genDoc);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    const status = msg.includes("קרדיטים") ? 402 : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // Optional: attach Brand Kit settings (logo/color/contact) so Make can overlay watermark/outro,
  // especially useful for Premium (Veo/Kling) where we prefer NOT to feed a logo as cover image.
  let brandKit: BrandKitDoc | null = null;
  try {
    const brandKitSnap = await adminDb.doc(`users/${userId}/brandKit/settings`).get();
    brandKit = brandKitSnap.exists ? (brandKitSnap.data() as BrandKitDoc) : null;
  } catch {
    brandKit = null;
  }
  const brandKitLogoUrl = brandKit?.logoUrl ?? null;
  const brandKitPrimaryColor = brandKit?.primaryColor ?? null;

  // Local pipeline (no Make):
  // Gemini (text/logic) -> Imagen (background) -> Cloudinary -> Firestore update.
  try {
    const visionImage = await fetchFirstUploadAsVisionInput(uploadedImageUrls);
    const brief = await geminiGenerateBrief({
      niche,
      userRequest,
      type,
      selectedStyle,
      customPrompt,
      visionImage,
    });

    if (type === "premium") {
      // Premium (Veo) is handled asynchronously by a worker (scripts/veo-worker.ts).
      await genRef.set(
        {
          status: "processing",
          caption: brief.caption,
          hashtags: brief.hashtags ?? null,
          overlayText: brief.overlayText,
          // Keep prompts for worker/debugging.
          imagePrompt: brief.prompt,
          videoPrompt: brief.videoPrompt ?? brief.prompt,
          aspectRatio,
          // Helpful for UI/debugging: make it clear this is a worker-driven async process.
          premiumProvider: "veo",
          // Brand kit fields can help watermark downstream if desired.
          brandKitLogoUrl,
          brandKitPrimaryColor,
          errorMessage: null,
        },
        { merge: true },
      );
      return NextResponse.json({ genId });
    }

    const rawUploads = (uploadedImageUrls ?? []).filter(Boolean);
    const targetCount = type === "remotion" ? 3 : 1;
    const needCount = type === "remotion" ? Math.max(0, targetCount - rawUploads.length) : 1;

    const stored: string[] = [];
    if (type !== "remotion" || needCount > 0) {
      const imgs = await imagenGenerateMany({
        prompt: brief.prompt,
        aspectRatio,
        sampleCount: type === "remotion" ? needCount : 1,
      });
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i]!;
        const finalBytes =
          type === "image" && brandKitLogoUrl
            ? await watermarkImageWithLogo({ imageBytes: img.bytes, logoUrl: brandKitLogoUrl }).catch(() => img.bytes)
            : img.bytes;
        const url = await storeGeneratedAsset({
          kind: "images",
          genId,
          suffix: imgs.length > 1 ? `-${i}` : "",
          bytes: finalBytes,
          mimeType: img.mimeType,
        });
        stored.push(url);
      }
    }

    const imageUrl = type === "remotion" && rawUploads.length > 0 ? rawUploads[0]! : stored[0]!;

    if (type === "image") {
      await genRef.set(
        {
          status: "done",
          resultUrl: imageUrl,
          caption: brief.caption,
          hashtags: brief.hashtags ?? null,
          overlayText: brief.overlayText,
          errorMessage: null,
        },
        { merge: true },
      );
    } else if (type === "remotion") {
      // Remotion flow: render automatically (no review/confirm step).
      const three = [...rawUploads, ...stored].slice(0, 3);
      await genRef.set(
        {
          status: "rendering",
          sourceImageUrl: imageUrl,
          ...(three.length ? { sourceImageUrls: three, sourceImageUrl: three[0] ?? imageUrl } : {}),
          caption: brief.caption,
          hashtags: brief.hashtags ?? null,
          overlayText: brief.overlayText,
          ...(brief.audioVibe ? { audioVibe: brief.audioVibe } : {}),
          ...(brief.sfxUrl ? { sfxUrl: brief.sfxUrl } : {}),
          renderLockedAt: null,
          errorMessage: null,
        },
        { merge: true },
      );
    }
  } catch (e) {
    // Best-effort refund on failure (so user doesn't lose credits on AI errors).
    try {
      await adminDb.runTransaction(async (tx) => {
        const [creditsSnap, genSnap] = await Promise.all([tx.get(creditsRef), tx.get(genRef)]);
        const current =
          creditsSnap.exists && typeof creditsSnap.get("balance") === "number"
            ? (creditsSnap.get("balance") as number)
            : 0;
        const status = genSnap.exists ? (genSnap.get("status") as string | undefined) : undefined;
        if (status && status !== "error") {
          tx.set(creditsRef, { balance: current + cost, updatedAt: Date.now() }, { merge: true });
        }
      });
    } catch {
      // ignore refund failure
    }
    await genRef.set(
      {
        status: "error",
        errorMessage: e instanceof Error ? e.message : "AI pipeline error",
      },
      { merge: true },
    );
  }

  return NextResponse.json({ genId });
}

