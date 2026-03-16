import "./load-env";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

import { isR2Configured, uploadToR2 } from "./r2-upload";

const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID;
const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

type JamendoTrack = {
  id: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
};

type JamendoResponse = { results?: JamendoTrack[] };

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || "";
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "";
const RAW_PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY || "";
const PRIVATE_KEY = RAW_PRIVATE_KEY.replace(/\\n/g, "\n");

if (!PROJECT_ID || !CLIENT_EMAIL || !RAW_PRIVATE_KEY) {
  throw new Error("Missing FIREBASE_ADMIN_* env vars for remotion worker.");
}
if (!isR2Configured()) {
  throw new Error(
    "Missing R2_* env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL).",
  );
}

function getAdmin() {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }),
  });
}

const app = getAdmin();
const db = getFirestore(app);

let serveUrlPromise: Promise<string> | null = null;

async function getServeUrl() {
  if (!serveUrlPromise) {
    serveUrlPromise = bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
      webpackOverride: (config) => config,
    });
  }
  return serveUrlPromise;
}

const REMOTION_STYLES = ["default", "pop", "dramatic", "viral"] as const;
const AUDIO_VIBES = ["energetic", "calm", "luxury", "trendy"] as const;

/** Prefer videoStyle from doc (Make/Gemini); else default to viral. */
function getVideoStyle(doc: { videoStyle?: string | null }): (typeof REMOTION_STYLES)[number] {
  const v = doc.videoStyle;
  if (v && REMOTION_STYLES.includes(v as (typeof REMOTION_STYLES)[number])) {
    return v as (typeof REMOTION_STYLES)[number];
  }
  return REMOTION_STYLES[Math.floor(Math.random() * REMOTION_STYLES.length)]!;
}

function pickAudioVibe(doc: { audioVibe?: string | null }): (typeof AUDIO_VIBES)[number] {
  const v = doc.audioVibe;
  if (v && AUDIO_VIBES.includes(v as (typeof AUDIO_VIBES)[number])) {
    return v as (typeof AUDIO_VIBES)[number];
  }
  return AUDIO_VIBES[Math.floor(Math.random() * AUDIO_VIBES.length)]!;
}

const VIBE_TAGS: Record<(typeof AUDIO_VIBES)[number], string> = {
  energetic: "electronic+upbeat+energy+positive",
  calm: "ambient+chill+lofi",
  luxury: "cinematic+orchestral+elegant+corporate",
  trendy: "pop+electronic+indie+lofi",
};

const SOCIAL_SFX_PACK = "Social SFX Pack - Collection 1";

/** Resolve public dir: must run Worker from project root (brandblitz-il), not from scripts/. */
async function getPublicDir(): Promise<string> {
  const fromCwd = path.join(process.cwd(), "public");
  const packPath = path.join(fromCwd, SOCIAL_SFX_PACK);
  try {
    await fs.readdir(packPath);
    return fromCwd;
  } catch {
    // eslint-disable-next-line no-console
    console.log("SFX pack path checked:", packPath, "(cwd:", process.cwd() + ")");
    return path.resolve(process.cwd(), "public");
  }
}

/**
 * Base URL for audio/SFX that Remotion will download during render.
 * Use REMOTION_AUDIO_BASE_URL when using ngrok: set it to http://localhost:3000 (or your dev port)
 * so Remotion fetches from localhost and avoids ngrok's "Visit Site" block on non-browser requests.
 */
function getAudioBaseUrl(): string {
  const base =
    process.env.REMOTION_AUDIO_BASE_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";
  return base.replace(/\/$/, "");
}

const OVERLAY_FALLBACK = "טקסט בעברית\nשכבה מונפשת";

/** Detect if string looks like a prompt/negative prompt from Make (wrong field). */
function looksLikePromptMeta(s: string): boolean {
  const lower = s.toLowerCase().trim();
  return (
    lower.includes("prompt") &&
    (lower.includes("negative") || lower.includes("despicroptin") || lower.includes("description"))
  );
}

/** Sanitize overlayText: reject prompt metadata, remove "BrandBlitz IL", ensure Hebrew display text. */
function sanitizeOverlayText(raw: string, caption: string | null): string {
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

/** Pick a random audio file from a subfolder of Social SFX Pack. Returns null if folder missing or empty. */
async function pickRandomFromPack(publicDir: string, subdir: string): Promise<string | null> {
  const dir = path.join(publicDir, SOCIAL_SFX_PACK, subdir);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return null;
  }
  const audio = files.filter((f) => /\.(mp3|wav|flac)$/i.test(f));
  if (audio.length === 0) return null;
  const file = audio[Math.floor(Math.random() * audio.length)]!;
  const baseUrl = getAudioBaseUrl();
  const segment = encodeURIComponent(SOCIAL_SFX_PACK) + "/" + encodeURIComponent(subdir) + "/" + encodeURIComponent(file);
  return `${baseUrl}/${segment}`;
}

/** Hook = Whooshs or Risers. Impact = Impacts or Drops. Always use local pack when available. */
async function getLocalSfxPackUrls(): Promise<{ hookSfxUrl: string | null; impactSfxUrl: string | null }> {
  const publicDir = await getPublicDir();
  const [whoosh, riser, impact, drop] = await Promise.all([
    pickRandomFromPack(publicDir, "Whooshs"),
    pickRandomFromPack(publicDir, "Risers"),
    pickRandomFromPack(publicDir, "Impacts"),
    pickRandomFromPack(publicDir, "Drops"),
  ]);
  const hookSfxUrl = whoosh ?? riser ?? null;
  const impactSfxUrl = impact ?? drop ?? null;
  return { hookSfxUrl, impactSfxUrl };
}

const MOTION_VARIANTS = ["zoomIn", "zoomOut", "panLeft", "panRight"] as const;
function pickRandomMotionVariant(): (typeof MOTION_VARIANTS)[number] {
  return MOTION_VARIANTS[Math.floor(Math.random() * MOTION_VARIANTS.length)]!;
}

const TEXT_ENTRY_VARIANTS = ["fade-up", "scale-in", "slide-from-side"] as const;
function pickRandomTextEntryVariant(): (typeof TEXT_ENTRY_VARIANTS)[number] {
  return TEXT_ENTRY_VARIANTS[Math.floor(Math.random() * TEXT_ENTRY_VARIANTS.length)]!;
}

const HOOK_VARIANTS = ["none", "shake", "punch", "swipe"] as const;
function pickRandomHookVariant(): (typeof HOOK_VARIANTS)[number] {
  return HOOK_VARIANTS[Math.floor(Math.random() * HOOK_VARIANTS.length)]!;
}

const OVERLAY_VARIANTS = ["minimal", "clean", "party", "dramatic"] as const;
function pickRandomOverlayVariant(): (typeof OVERLAY_VARIANTS)[number] {
  return OVERLAY_VARIANTS[Math.floor(Math.random() * OVERLAY_VARIANTS.length)]!;
}

const TEXT_VARIANTS = ["clean", "outline", "neon", "condensed"] as const;
function pickRandomTextVariant(): (typeof TEXT_VARIANTS)[number] {
  return TEXT_VARIANTS[Math.floor(Math.random() * TEXT_VARIANTS.length)]!;
}

/** Get one random track URL from Jamendo API for the given vibe. No local files. Returns null on failure (render continues without music). */
async function getMusicUrlFromJamendo(vibe: (typeof AUDIO_VIBES)[number]): Promise<{
  musicUrl: string | null;
  musicStartFromFrame: number;
  playbackRate: number;
}> {
  const defaultResult = { musicUrl: null as string | null, musicStartFromFrame: 0, playbackRate: 1 };
  if (!JAMENDO_CLIENT_ID) return defaultResult;
  try {
    const params = new URLSearchParams({
      client_id: JAMENDO_CLIENT_ID,
      format: "json",
      limit: "50",
      fuzzytags: VIBE_TAGS[vibe],
    });
    const res = await fetch(`${JAMENDO_BASE}/tracks/?${params}`);
    if (!res.ok) return defaultResult;
    const data = (await res.json()) as JamendoResponse;
    const list = (data.results ?? []).filter((t) => t.audiodownload_allowed && t.audiodownload);
    if (list.length === 0) return defaultResult;
    const track = list[Math.floor(Math.random() * list.length)]!;
    const musicUrl = track.audiodownload ?? null;
    return {
      musicUrl,
      musicStartFromFrame: Math.floor(Math.random() * 301),
      playbackRate: 0.95 + Math.random() * 0.1,
    };
  } catch {
    return defaultResult;
  }
}

/** sfxUrl from HTTP request (Make callback) – stored in Firestore. Validate URL; return null if missing or invalid (render continues without SFX). */
function getSfxUrlFromDoc(doc: { sfxUrl?: string | null }): string | null {
  const u = doc.sfxUrl;
  if (!u || typeof u !== "string" || !u.startsWith("http")) return null;
  try {
    new URL(u);
    return u;
  } catch {
    return null;
  }
}

/** Check if URL is reachable (no 403/404). Remotion will fail if we pass a blocked URL. Returns false on error or 403/404. */
async function validateAudioUrl(url: string, timeoutMs = 8000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "BrandBlitz-Remotion-Worker/1.0" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (res.status === 403 || res.status === 404) return false;
    if (res.ok || res.status === 405) return true;
    return false;
  } catch {
    return false;
  }
}

async function renderMp4({
  compositionId,
  imageUrl,
  text,
  videoStyle,
  hookVariant,
  overlayVariant,
  textVariant,
  musicUrl,
  musicStartFromFrame,
  playbackRate,
  sfxUrl,
  hookSfxUrl,
  motionVariant,
  textEntryVariant,
  images,
  brandLogoUrl,
  brandPrimaryColor,
  brandPhone,
  brandWebsite,
}: {
  compositionId: string;
  imageUrl: string;
  text: string;
  videoStyle: "default" | "pop" | "dramatic" | "viral";
  hookVariant?: (typeof HOOK_VARIANTS)[number];
  overlayVariant?: (typeof OVERLAY_VARIANTS)[number];
  textVariant?: (typeof TEXT_VARIANTS)[number];
  musicUrl?: string | null;
  musicStartFromFrame?: number;
  playbackRate?: number;
  sfxUrl?: string | null;
  hookSfxUrl?: string | null;
  motionVariant?: string;
  textEntryVariant?: string;
  /** When set, Remotion renders a multi-image slideshow (חומרי גלם). */
  images?: string[];
  brandLogoUrl?: string;
  brandPrimaryColor?: string;
  brandPhone?: string;
  brandWebsite?: string;
}) {
  const serveUrl = await getServeUrl();
  const inputProps: Record<string, unknown> = {
    imageUrl,
    text,
    videoStyle,
  };
  if (hookVariant) inputProps.hookVariant = hookVariant;
  if (overlayVariant) inputProps.overlayVariant = overlayVariant;
  if (textVariant) inputProps.textVariant = textVariant;
  if (musicUrl) {
    inputProps.musicUrl = musicUrl;
    inputProps.musicStartFromFrame = musicStartFromFrame ?? 0;
    inputProps.playbackRate = playbackRate ?? 1;
  }
  if (sfxUrl) inputProps.sfxUrl = sfxUrl;
  if (hookSfxUrl) inputProps.hookSfxUrl = hookSfxUrl;
  if (motionVariant) inputProps.motionVariant = motionVariant;
  if (textEntryVariant) inputProps.textEntryVariant = textEntryVariant;
  if (images?.length) inputProps.images = images;
  if (brandLogoUrl) inputProps.brandLogoUrl = brandLogoUrl;
  if (brandPrimaryColor) inputProps.brandPrimaryColor = brandPrimaryColor;
  if (brandPhone) inputProps.brandPhone = brandPhone;
  if (brandWebsite) inputProps.brandWebsite = brandWebsite;

  const comp = await selectComposition({ serveUrl, id: compositionId, inputProps });
  const outPath = path.join(os.tmpdir(), `brandblitz-${Date.now()}.mp4`);

  await renderMedia({
    serveUrl,
    composition: comp,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });

  const buf = await fs.readFile(outPath);
  await fs.unlink(outPath).catch(() => {});
  return buf;
}

async function claimJob(genId: string) {
  const ref = db.collection("generations").doc(genId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== "rendering" || data.type !== "remotion") return null;
    if (data.renderLockedAt) return null;
    tx.set(ref, { renderLockedAt: Date.now() }, { merge: true });
    return { ref, data };
  });
}

async function processOne(genId: string) {
  const claimed = await claimJob(genId);
  if (!claimed) return false;

  const { ref, data } = claimed;
  const sourceImageUrls = (data.sourceImageUrls as string[] | null | undefined)?.filter(
    (u): u is string => typeof u === "string" && u.startsWith("http"),
  ) ?? null;
  const sourceImageUrl = (sourceImageUrls?.[0] ?? (data.sourceImageUrl as string | null)) ?? null;
  const rawOverlay = (data.overlayText as string | null) ?? "";
  const caption = (data.caption as string | null) ?? null;
  const overlayText = sanitizeOverlayText(rawOverlay, caption);
  if (rawOverlay.trim() !== overlayText) {
    // eslint-disable-next-line no-console
    console.log("Overlay sanitized (was prompt metadata or contained BrandBlitz IL), using:", overlayText.slice(0, 60) + (overlayText.length > 60 ? "…" : ""));
  }

  if (!sourceImageUrl) {
    await ref.set({ status: "error", errorMessage: "Missing sourceImageUrl or sourceImageUrls" }, { merge: true });
    return true;
  }

  try {
    const videoStyle = getVideoStyle(data);
    const vibe = pickAudioVibe(data);
    const motionVariant = pickRandomMotionVariant();
    const textEntryVariant = pickRandomTextEntryVariant();
    const hookVariant = pickRandomHookVariant();
    const overlayVariant = pickRandomOverlayVariant();
    const textVariant = pickRandomTextVariant();
    const ar = (data.aspectRatio as string | null | undefined) ?? "9:16";
    const compositionId =
      ar === "1:1" ? "BrandBlitzSquare" : ar === "16:9" ? "BrandBlitzLandscape" : "BrandBlitzVertical";
    const { hookSfxUrl: localHookSfx, impactSfxUrl: localImpactSfx } = await getLocalSfxPackUrls();
    const music = await getMusicUrlFromJamendo(vibe);
    let musicUrl = music.musicUrl;
    const { musicStartFromFrame, playbackRate } = music;
    let sfxUrl = localImpactSfx ?? getSfxUrlFromDoc(data);
    const hookSfxUrl = localHookSfx ?? null;
    if (!localHookSfx && !localImpactSfx && !getSfxUrlFromDoc(data)) {
      // eslint-disable-next-line no-console
      console.warn(
      "TIP: No SFX found. Run the Worker from the project root (brandblitz-il), not from scripts/. " +
        "Expected folder: public/Social SFX Pack - Collection 1/ (exact name, with spaces and hyphen). Or set sfxUrl in Make callback.",
    );
    }

    const isLocalSfxUrl = (u: string) => u.includes("Social%20SFX%20Pack") || u.includes(SOCIAL_SFX_PACK);

    if (musicUrl && !(await validateAudioUrl(musicUrl))) {
      // eslint-disable-next-line no-console
      console.warn("WARNING: Music URL returned 403/404 or timeout, continuing without music.");
      musicUrl = null;
    }
    if (sfxUrl && !isLocalSfxUrl(sfxUrl) && !(await validateAudioUrl(sfxUrl))) {
      // eslint-disable-next-line no-console
      console.warn("WARNING: Could not download SFX (403/404 or timeout), continuing without it.");
      sfxUrl = null;
    }

    // eslint-disable-next-line no-console
    console.log("--- NEW JOB RECEIVED ---");
    // eslint-disable-next-line no-console
    console.log("Music Vibe:", vibe);
    // eslint-disable-next-line no-console
    console.log("Music URL:", musicUrl ?? "(none)");
    if (hookSfxUrl || sfxUrl) {
      // eslint-disable-next-line no-console
      console.log("Local SFX Selected: Hook =", hookSfxUrl ? "yes" : "no", "| Impact =", sfxUrl ? "yes" : "no");
    }
    // eslint-disable-next-line no-console
    console.log("Hook SFX URL:", hookSfxUrl ?? "(none)");
    // eslint-disable-next-line no-console
    console.log("Impact SFX URL:", sfxUrl ?? "(none)");
    // eslint-disable-next-line no-console
    console.log("Motion variant:", motionVariant);
    // eslint-disable-next-line no-console
    console.log("Text entry variant:", textEntryVariant);
    // eslint-disable-next-line no-console
    console.log("Hook variant:", hookVariant);
    // eslint-disable-next-line no-console
    console.log("Overlay variant:", overlayVariant);
    // eslint-disable-next-line no-console
    console.log("Text variant:", textVariant);
    if (sourceImageUrls?.length) {
      // eslint-disable-next-line no-console
      console.log("Multi-image slideshow:", sourceImageUrls.length, "images");
    }

    const userId = data.userId as string;
    let brandKit: { logoUrl?: string | null; primaryColor?: string | null } = {};
    try {
      const brandSnap = await db.doc(`users/${userId}/brandKit/settings`).get();
      if (brandSnap.exists) {
        const b = brandSnap.data();
        if (b && (b.logoUrl != null || b.primaryColor != null)) {
          brandKit = {
            logoUrl: (b.logoUrl as string) ?? undefined,
            primaryColor: (b.primaryColor as string) ?? undefined,
          };
          if (brandKit.logoUrl || brandKit.primaryColor) {
            // eslint-disable-next-line no-console
            console.log("Brand Kit: logo =", !!brandKit.logoUrl, "| color =", !!brandKit.primaryColor);
          }
        }
      }
    } catch {
      // no brand kit – continue without
    }

    const props = {
      compositionId,
      imageUrl: sourceImageUrl,
      text: overlayText,
      videoStyle,
      hookVariant,
      overlayVariant,
      textVariant,
      musicUrl: musicUrl ?? undefined,
      musicStartFromFrame,
      playbackRate,
      sfxUrl: sfxUrl ?? undefined,
      hookSfxUrl: hookSfxUrl ?? undefined,
      motionVariant,
      textEntryVariant,
      ...(sourceImageUrls?.length ? { images: sourceImageUrls } : {}),
      ...(brandKit.logoUrl ? { brandLogoUrl: brandKit.logoUrl } : {}),
      ...(brandKit.primaryColor ? { brandPrimaryColor: brandKit.primaryColor } : {}),
    };

    let mp4: Buffer;
    try {
      mp4 = await renderMp4(props);
    } catch (renderErr) {
      const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      const isBlockedAudio =
        msg.includes("403") ||
        msg.includes("404") ||
        msg.includes("AccessDenied") ||
        msg.includes("downloading") ||
        msg.includes("download");
      if (isBlockedAudio && (props.musicUrl || props.sfxUrl)) {
        // eslint-disable-next-line no-console
        console.warn("WARNING: Render failed (blocked audio URL). Retrying without music/SFX.");
        mp4 = await renderMp4({
          compositionId,
          imageUrl: sourceImageUrl,
          text: overlayText,
          videoStyle,
          hookVariant,
          overlayVariant,
          textVariant,
          motionVariant: props.motionVariant,
          textEntryVariant: props.textEntryVariant,
          ...(sourceImageUrls?.length ? { images: sourceImageUrls } : {}),
          ...(props.brandLogoUrl ? { brandLogoUrl: props.brandLogoUrl } : {}),
          ...(props.brandPrimaryColor ? { brandPrimaryColor: props.brandPrimaryColor } : {}),
        });
      } else {
        throw renderErr;
      }
    }

    const objectPath = `generations/${genId}/video.mp4`;
    const publicUrl = await uploadToR2(objectPath, mp4, "video/mp4");

    await ref.set(
      {
        status: "done",
        resultUrl: publicUrl,
        caption,
        overlayText,
        errorMessage: null,
      },
      { merge: true },
    );
  } catch (e) {
    await ref.set(
      { status: "error", errorMessage: e instanceof Error ? e.message : "Render failed" },
      { merge: true },
    );
  }

  return true;
}

async function tick() {
  const snap = await db
    .collection("generations")
    .where("type", "==", "remotion")
    .where("status", "==", "rendering")
    .orderBy("createdAt", "asc")
    .limit(3)
    .get();

  const ids = snap.docs.map((d) => d.id);
  if (ids.length === 0) return;
  for (const id of ids) {
    await processOne(id);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("BrandBlitz Remotion worker started (storage: R2). Polling for rendering jobs...");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("tick error", e);
    });
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

