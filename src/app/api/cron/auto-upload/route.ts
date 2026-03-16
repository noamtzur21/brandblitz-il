import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import type { GenerationType } from "@/lib/credits";
import { CREDIT_COST } from "@/lib/credits";
import type { AutoUploadSettingsDoc, BrandKitDoc, GenerationDoc } from "@/lib/types";
import { getAdminDb } from "@/lib/firebase/admin";
import { geminiGenerateBrief } from "@/lib/vertex/gemini";
import { imagenGenerateMany } from "@/lib/vertex/imagen";
import { storeGeneratedAsset } from "@/lib/generatedAssetStore";
import { watermarkImageWithLogo } from "@/lib/images/watermark";
import { publishGenerationToMeta } from "@/lib/integrations/publishGenerationToMeta";

type Dest = { platform: "instagram" | "facebook"; placement: "post" | "reels" | "story" };

type ScheduledPostDoc = {
  userId: string;
  // publish time (ms UTC)
  scheduledAt: number;
  // when to start generation (ms UTC). If missing, compute from scheduledAt + contentType.
  generateAt?: number;
  // local day key (yyyyLLdd) + slot (HH:MM) for de-dupe and UX
  dayKey?: string;
  slot?: string;
  timeZone: string; // Asia/Jerusalem
  destination: Dest;
  contentType: GenerationType;
  niche: string;
  userRequestTemplate: string;
  requireApproval: boolean;
  status:
    | "scheduled"
    | "generating"
    | "waiting_asset"
    | "pending_approval"
    | "approved"
    | "publishing"
    | "done"
    | "cancelled"
    | "rejected"
    | "error";
  generationId?: string | null;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
  lockedAt?: number | null;
  metaCreationId?: string | null;
};

function requireCronAuth(req: Request) {
  // Vercel Cron adds this header. Accept it to avoid hardcoding secrets in vercel.json.
  const vercelCron = req.headers.get("x-vercel-cron");
  if (vercelCron === "1") return;

  const secret = process.env.CRON_SECRET || "";
  if (!secret) throw new Error("Missing CRON_SECRET");
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1] || "";
  const url = new URL(req.url);
  const q = url.searchParams.get("secret") || "";
  if (token !== secret && q !== secret) throw new Error("Unauthorized");
}

function buildDailyPlan(mix: { image: number; remotion: number; premium: number }): GenerationType[] {
  const out: GenerationType[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(mix.image)); i++) out.push("image");
  for (let i = 0; i < Math.max(0, Math.floor(mix.remotion)); i++) out.push("remotion");
  for (let i = 0; i < Math.max(0, Math.floor(mix.premium)); i++) out.push("premium");
  return out.length ? out : ["image"];
}

function pickDeterministic<T>(arr: T[], seed: number): T {
  const i = Math.abs(seed) % arr.length;
  return arr[i]!;
}

async function createGenerationForScheduledPost(opts: {
  db: ReturnType<typeof getAdminDb>;
  userId: string;
  type: GenerationType;
  niche: string;
  userRequest: string | null;
  aspectRatio: "9:16" | "1:1" | "16:9";
}): Promise<string> {
  const { db, userId, type, niche, userRequest, aspectRatio } = opts;
  const cost = CREDIT_COST[type];
  const creditsRef = db.doc(`users/${userId}/credits/summary`);
  const genRef = db.collection("generations").doc();
  const genId = genRef.id;

  await db.runTransaction(async (tx) => {
    const creditsSnap = await tx.get(creditsRef);
    const balance =
      creditsSnap.exists && typeof creditsSnap.get("balance") === "number" ? (creditsSnap.get("balance") as number) : 0;
    if (balance < cost) throw new Error("אין מספיק קרדיטים להעלאה אוטומטית");
    tx.set(creditsRef, { balance: balance - cost, updatedAt: Date.now() }, { merge: true });

    const genDoc: GenerationDoc = {
      userId,
      niche,
      ...(userRequest ? { userRequest } : {}),
      type,
      logoUrl: null,
      status: "processing",
      createdAt: Date.now(),
      resultUrl: null,
      caption: null,
      hashtags: null,
      overlayText: null,
      errorMessage: null,
      aspectRatio,
    };
    tx.set(genRef, genDoc);
  });

  // Brand kit for watermark/logo & color (best-effort)
  let brandKit: BrandKitDoc | null = null;
  try {
    const snap = await db.doc(`users/${userId}/brandKit/settings`).get();
    brandKit = snap.exists ? (snap.data() as BrandKitDoc) : null;
  } catch {
    brandKit = null;
  }
  const brandKitLogoUrl = brandKit?.logoUrl ?? null;
  const brandKitPrimaryColor = brandKit?.primaryColor ?? null;

  // Generate brief + assets
  const brief = await geminiGenerateBrief({
    niche,
    userRequest,
    type,
    selectedStyle: type === "premium" ? "business_professional" : null,
    customPrompt: "",
    visionImage: null,
  });

  if (type === "premium") {
    await genRef.set(
      {
        status: "processing",
        caption: brief.caption,
        hashtags: brief.hashtags ?? null,
        overlayText: brief.overlayText,
        imagePrompt: brief.prompt,
        videoPrompt: brief.videoPrompt ?? brief.prompt,
        aspectRatio,
        premiumProvider: "veo",
        brandKitLogoUrl,
        brandKitPrimaryColor,
        errorMessage: null,
      } as any,
      { merge: true },
    );
    return genId;
  }

  if (type === "remotion") {
    const imgs = await imagenGenerateMany({ prompt: brief.prompt, aspectRatio, sampleCount: 3 });
    const stored: string[] = [];
    for (let i = 0; i < imgs.length; i++) {
      const img = imgs[i]!;
      const url = await storeGeneratedAsset({
        kind: "images",
        genId,
        suffix: `-${i}`,
        bytes: img.bytes,
        mimeType: img.mimeType,
      });
      stored.push(url);
    }
    await genRef.set(
      {
        status: "rendering",
        sourceImageUrls: stored,
        sourceImageUrl: stored[0] ?? null,
        caption: brief.caption,
        hashtags: brief.hashtags ?? null,
        overlayText: brief.overlayText,
        aspectRatio,
        errorMessage: null,
        renderLockedAt: null,
      } as any,
      { merge: true },
    );
    return genId;
  }

  // image
  const imgs = await imagenGenerateMany({ prompt: brief.prompt, aspectRatio, sampleCount: 1 });
  const img = imgs[0]!;
  const finalBytes =
    brandKitLogoUrl
      ? await watermarkImageWithLogo({ imageBytes: img.bytes, logoUrl: brandKitLogoUrl }).catch(() => img.bytes)
      : img.bytes;
  const url = await storeGeneratedAsset({
    kind: "images",
    genId,
    bytes: finalBytes,
    mimeType: img.mimeType,
  });
  await genRef.set(
    {
      status: "done",
      resultUrl: url,
      caption: brief.caption,
      hashtags: brief.hashtags ?? null,
      overlayText: null,
      aspectRatio,
      errorMessage: null,
    },
    { merge: true },
  );
  return genId;
}

async function publishNow(opts: {
  userId: string;
  genId: string;
  destination: Dest;
  resumeCreationId?: string | null;
}) {
  return await publishGenerationToMeta({
    uid: opts.userId,
    genId: opts.genId,
    destination: opts.destination,
    resumeCreationId: opts.resumeCreationId ?? null,
  });
}

const GENERATE_LEAD_MS: Record<GenerationType, number> = {
  image: 2 * 60_000,
  remotion: 12 * 60_000,
  premium: 45 * 60_000,
};

function getGenerateAtMs(post: ScheduledPostDoc): number {
  if (typeof post.generateAt === "number" && Number.isFinite(post.generateAt)) return post.generateAt;
  const lead = GENERATE_LEAD_MS[post.contentType] ?? (5 * 60_000);
  return post.scheduledAt - lead;
}

async function markErrorAndRelease(ref: FirebaseFirestore.DocumentReference, message: string, now: number) {
  await ref.set(
    {
      status: "error",
      errorMessage: message,
      metaCreationId: null,
      lockedAt: null,
      updatedAt: now,
    },
    { merge: true },
  );
}

export async function GET(req: Request) {
  try {
    requireCronAuth(req);
    const db = getAdminDb();
    const now = Date.now();

    const settingsSnaps = await db.collectionGroup("autoUpload").get();
    const settings = settingsSnaps.docs
      .filter((d) => d.id === "settings")
      .map((d) => ({ ref: d.ref, data: d.data() as Partial<AutoUploadSettingsDoc> }))
      .filter((x) => !!x.data?.enabled);

    // 1) Ensure scheduled posts exist for today in Israel timezone
    for (const s of settings) {
      const pathParts = s.ref.path.split("/");
      const userId = pathParts[1] || "";
      if (!userId) continue;
      const timeZone = (s.data.timeZone as any) || "Asia/Jerusalem";
      const slots = Array.isArray(s.data.timeSlots) ? (s.data.timeSlots as string[]) : [];
      const dests: Dest[] = (Array.isArray(s.data.destinations) ? (s.data.destinations as any[]) : [])
        .map((d) => {
          const platform = d?.platform;
          const placement = d?.placement;
          if (platform !== "instagram" && platform !== "facebook") return null;
          if (placement !== "post" && placement !== "reels" && placement !== "story") return null;
          return { platform, placement } as Dest;
        })
        .filter(Boolean) as Dest[];
      if (!slots.length || !dests.length) continue;

      const localNow = DateTime.fromMillis(now, { zone: timeZone });
      const dayKey = localNow.toFormat("yyyyLLdd");
      const plan = buildDailyPlan(s.data.mix as any);
      const postsPerDay = Math.max(1, Math.min(12, Math.floor(Number(s.data.postsPerDay || plan.length))));
      const slotTypes = (s.data.slotTypes && typeof s.data.slotTypes === "object" ? s.data.slotTypes : {}) as Record<
        string,
        any
      >;

      for (let i = 0; i < Math.min(postsPerDay, slots.length); i++) {
        const hhmm = slots[i]!;
        const [hh, mm] = hhmm.split(":").map((n) => Number(n));
        const local = localNow.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
        const scheduledAt = local.toUTC().toMillis();
        const dest = pickDeterministic(dests, i + scheduledAt);
        const overrideRaw = slotTypes?.[hhmm];
        const overrideType =
          overrideRaw === "image" || overrideRaw === "remotion" || overrideRaw === "premium" ? (overrideRaw as GenerationType) : null;
        const type = overrideType ?? pickDeterministic(plan, i + scheduledAt * 7);
        const generateAt = scheduledAt - (GENERATE_LEAD_MS[type] ?? 5 * 60_000);

        // Stable ID per slot (so changing contentType doesn't create duplicates)
        const id = `${userId}_${dayKey}_${hhmm.replace(":", "")}_${dest.platform}_${dest.placement}`;
        const ref = db.doc(`scheduledPosts/${id}`);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) {
            tx.set(
              ref,
              {
                userId,
                dayKey,
                slot: hhmm,
                scheduledAt,
                generateAt,
                timeZone,
                destination: { platform: dest.platform, placement: dest.placement },
                contentType: type,
                niche: String(s.data.niche || "כללי"),
                userRequestTemplate: String(s.data.userRequestTemplate || ""),
                requireApproval: s.data.requireApproval ?? true,
                status: "scheduled",
                createdAt: now,
                updatedAt: now,
              } satisfies ScheduledPostDoc,
              { merge: true },
            );
            return;
          }
          const d = snap.data() as ScheduledPostDoc;
          // Only update future/pending schedule. Never reset in-flight statuses.
          if (d.status !== "scheduled") return;
          tx.set(
            ref,
            {
              dayKey,
              slot: hhmm,
              scheduledAt,
              generateAt,
              timeZone,
              destination: { platform: dest.platform, placement: dest.placement },
              contentType: type,
              niche: String(s.data.niche || "כללי"),
              userRequestTemplate: String(s.data.userRequestTemplate || ""),
              requireApproval: s.data.requireApproval ?? true,
              updatedAt: now,
            },
            { merge: true },
          );
        });
      }
    }

    // 2) Process posts (keep each cron run short)
    const MAX_TO_PROCESS = 6;
    const candidates = await db
      .collection("scheduledPosts")
      .where("status", "in", ["scheduled", "waiting_asset", "pending_approval", "approved", "publishing"])
      .where("scheduledAt", ">=", now - 36 * 60 * 60_000) // keep window bounded
      .limit(MAX_TO_PROCESS)
      .get();

    let processed = 0;
    for (const doc of candidates.docs) {
      if (processed >= MAX_TO_PROCESS) break;
      const ref = doc.ref;
      const data = doc.data() as ScheduledPostDoc;

      // Recovery: fail stuck tasks to unblock user (status-based, not global TTL).
      const updatedAt = typeof data.updatedAt === "number" ? data.updatedAt : 0;
      const ageMs = updatedAt ? now - updatedAt : 0;
      if (data.status === "publishing" && ageMs > 60 * 60_000) {
        await markErrorAndRelease(ref, "Publishing timeout (60m).", now);
        continue;
      }
      if ((data.status === "generating" || data.status === "waiting_asset") && ageMs > 2 * 60 * 60_000) {
        await markErrorAndRelease(ref, "Generation timeout (120m).", now);
        continue;
      }

      // Gate "scheduled" by generateAt (start earlier than publish time)
      if (data.status === "scheduled") {
        const generateAt = getGenerateAtMs(data);
        if (now < generateAt) continue;

        // Per-user safety: don't start another job if user already has something in-flight
        const inflight = await db
          .collection("scheduledPosts")
          .where("userId", "==", data.userId)
          .where("status", "in", ["generating", "waiting_asset", "publishing"])
          .limit(1)
          .get();
        if (!inflight.empty) continue;
      }

      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const d = snap.data() as ScheduledPostDoc;
        if (
          d.status !== "scheduled" &&
          d.status !== "waiting_asset" &&
          d.status !== "pending_approval" &&
          d.status !== "approved" &&
          d.status !== "publishing"
        ) {
          return false;
        }
        const lockedAt = typeof (d as any).lockedAt === "number" ? Number((d as any).lockedAt) : 0;
        // Prevent tight loops on stuck docs: re-claim only if lock is stale.
        if (lockedAt && now - lockedAt < 60_000) return false;
        tx.set(ref, { lockedAt: now, updatedAt: now }, { merge: true });
        return true;
      });
      if (!claimed) continue;

      try {
        // Backfill de-dupe keys on old docs
        if (!data.dayKey || !data.slot) {
          const tz = (data.timeZone as any) || "Asia/Jerusalem";
          const local = DateTime.fromMillis(data.scheduledAt, { zone: tz });
          const dk = local.toFormat("yyyyLLdd");
          const sl = local.toFormat("HH:mm");
          await ref.set({ dayKey: dk, slot: sl, updatedAt: now }, { merge: true });
          (data as any).dayKey = dk;
          (data as any).slot = sl;
        }

        let genId = data.generationId ?? null;
        if (!genId) {
          await ref.set({ status: "generating", updatedAt: now }, { merge: true });
          genId = await createGenerationForScheduledPost({
            db,
            userId: data.userId,
            type: data.contentType,
            niche: data.niche,
            userRequest: data.userRequestTemplate?.trim() ? data.userRequestTemplate.trim() : null,
            aspectRatio: "9:16",
          });
          await ref.set({ generationId: genId, status: "waiting_asset", updatedAt: now }, { merge: true });
          processed++;
          // Generation kicked off; keep cron short.
          continue;
        }

        const genSnap = await db.doc(`generations/${genId}`).get();
        if (!genSnap.exists) continue;
        const gen = genSnap.data() as GenerationDoc;
        if (gen.status === "error") {
          await markErrorAndRelease(ref, gen.errorMessage || "Generation failed.", now);
          continue;
        }
        if (gen.status !== "done" || !gen.resultUrl) {
          // wait until ready (remotion/premium may take time)
          continue;
        }

        if (data.requireApproval) {
          // If already approved, do not regress back to pending_approval.
          if (data.status !== "approved") {
          await db.doc(`generations/${genId}`).set(
            {
              autoUpload: {
                enabled: true,
                requireApproval: true,
                status: "pending_approval",
                platform: data.destination.platform,
                placement: data.destination.placement,
                scheduledPostId: ref.id,
              },
            } as any,
            { merge: true },
          );
          await ref.set({ status: "pending_approval", updatedAt: now }, { merge: true });
          processed++;
          continue;
          }
        }

        // If it's not time to publish yet, keep it ready and wait.
        if (now < data.scheduledAt) continue;

        await ref.set({ status: "publishing", updatedAt: now }, { merge: true });
        await db.doc(`generations/${genId}`).set(
          {
            autoUpload: {
              enabled: true,
              requireApproval: !!data.requireApproval,
              status: "publishing",
              platform: data.destination.platform,
              placement: data.destination.placement,
              scheduledPostId: ref.id,
            },
          } as any,
          { merge: true },
        );

        const out = await publishNow({
          userId: data.userId,
          genId,
          destination: data.destination,
          resumeCreationId: data.metaCreationId ?? null,
        });

        if (!out.ok && out.processing) {
          await ref.set({ status: "publishing", metaCreationId: out.creationId, updatedAt: now }, { merge: true });
          processed++;
          continue;
        }

        await ref.set({ status: "done", metaCreationId: null, updatedAt: now }, { merge: true });
        await db.doc(`generations/${genId}`).set(
          {
            autoUpload: {
              enabled: true,
              requireApproval: false,
              status: "done",
              platform: data.destination.platform,
              placement: data.destination.placement,
              scheduledPostId: ref.id,
            },
          } as any,
          { merge: true },
        );
        processed++;
      } catch (e) {
        await ref.set({ status: "error", errorMessage: e instanceof Error ? e.message : "Auto upload failed", updatedAt: now }, { merge: true });
      }
    }

    return NextResponse.json({ ok: true, users: settings.length, processed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 401 });
  }
}

