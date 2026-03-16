"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import type { GenerationDoc } from "@/lib/types";
import { getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { useSession } from "@/app/providers";
import { getDemoGenById } from "@/lib/demo";
import { useToast } from "@/components/Toast";

function isVideoUrl(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".mp4") || u.includes("video") || u.includes(".webm");
}

function aspectClass(ar: string | null | undefined) {
  if (ar === "1:1") return "aspect-[1/1]";
  if (ar === "16:9") return "aspect-[16/9]";
  return "aspect-[9/16]";
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

function formatCaptionWithHashtags(gen: GenerationDoc) {
  const cap = (gen.caption ?? "").trim();
  const tags = Array.isArray(gen.hashtags) ? gen.hashtags.map((t) => String(t).trim()).filter(Boolean) : [];
  return [cap, tags.length ? tags.join(" ") : ""].filter(Boolean).join("\n\n").trim();
}

async function downloadAsset(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(obj);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export default function GenDetailsPage() {
  const params = useParams<{ genId: string }>();
  const genId = params?.genId;
  const router = useRouter();
  const { user, isDemo } = useSession();
  const { push } = useToast();

  const [gen, setGen] = useState<(GenerationDoc & { id: string }) | null>(null);
  const [confirmingRender, setConfirmingRender] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    if (!genId) return;

    if (isDemo || !isFirebaseClientConfigured()) {
      const d = getDemoGenById(genId);
      setGen(d);
      return;
    }

    const db = getClientDb();
    const ref = doc(db, "generations", genId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setGen(null);
          return;
        }
        setGen({ id: snap.id, ...(snap.data() as GenerationDoc) });
      },
      (err) => {
        if ((err as { code?: string } | null)?.code === "permission-denied") return;
        // eslint-disable-next-line no-console
        console.warn("[gen-details] listener error:", err);
      },
    );
    return () => unsub();
  }, [genId, isDemo]);

  const statusText = useMemo(() => {
    if (!gen) return "לא נמצא";
    if (gen.status === "done") return "מוכן";
    if (gen.status === "rendering") return "מרנדר וידאו...";
    if (gen.status === "pending_review") return "ערוך טקסט ואישור";
    if (gen.status === "error") return "שגיאה";
    if (gen.type === "premium") {
      const s = String(gen.premiumStage || "").toLowerCase();
      if (s === "submitted") return "נשלח לייצור (Veo)...";
      if (s === "generating") return "מייצר וידאו (Veo)...";
      if (s === "finalizing") return "מסיים ומעלה...";
      return "מייצר וידאו (Veo)...";
    }
    return "מעבד...";
  }, [gen]);

  const isPendingReview = gen?.status === "pending_review" && gen?.type === "remotion";
  // Legacy support: auto-confirm old pending_review remotion docs (no user click).
  useEffect(() => {
    if (!isPendingReview || !genId || !user || confirmingRender) return;
    setConfirmError(null);
    setConfirmingRender(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/generations/${genId}/confirm-render`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ overlayText: (gen?.overlayText ?? "").trim() || "כותרת" }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setConfirmError(data?.error ?? "אישור הרינדור נכשל");
        }
      } finally {
        setConfirmingRender(false);
      }
    })();
  }, [isPendingReview, genId, user, confirmingRender, gen?.overlayText]);

  const captionOnly = (gen?.caption ?? "עוד רגע...").trim();
  const captionForCopy = gen ? formatCaptionWithHashtags(gen) : captionOnly;
  const tags = Array.isArray(gen?.hashtags) ? (gen?.hashtags ?? []).filter(Boolean) : [];
  const [mediaLoading, setMediaLoading] = useState(false);
  useEffect(() => {
    if (gen?.resultUrl) setMediaLoading(true);
  }, [gen?.resultUrl]);

  return (
    <AppShell
      title="פריט"
      subtitle={gen ? `${gen.niche} • ${statusText}` : "לא נמצא"}
      right={
        <button
          type="button"
          className="bb-btn bb-btn-secondary text-sm"
          onClick={() => router.back()}
        >
          חזרה
        </button>
      }
    >
      {!gen ? (
        <div className="bb-card p-6 text-sm text-white/70">
          הפריט לא נמצא. חזור/י לדשבורד.
          <div className="mt-4">
            <Link href="/dashboard" className="bb-btn bb-btn-primary">
              לדשבורד
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="bb-card overflow-hidden">
            <div className={["relative w-full bg-white/5", aspectClass(gen.aspectRatio)].join(" ")}>
              {gen.resultUrl ? (
                isVideoUrl(gen.resultUrl) ? (
                  <>
                    {mediaLoading ? <LoadingOverlay /> : null}
                    <video
                      className="h-full w-full object-cover"
                      src={gen.resultUrl}
                      controls
                      playsInline
                      onLoadedData={() => setMediaLoading(false)}
                    />
                  </>
                ) : (
                  <>
                    {mediaLoading ? <LoadingOverlay /> : null}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gen.resultUrl}
                      alt="תוצאה"
                      className="h-full w-full object-cover"
                      onLoad={() => setMediaLoading(false)}
                    />
                  </>
                )
              ) : gen.type === "remotion" || gen.type === "premium" ? (
                <>
                  <LoadingOverlay />
                  <div className="flex h-full w-full items-center justify-center text-sm text-white/0">.</div>
                </>
              ) : gen.sourceImageUrl ? (
                <>
                  {mediaLoading ? <LoadingOverlay /> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gen.sourceImageUrl}
                    alt="תמונה מקורית"
                    className="h-full w-full object-cover opacity-85"
                    onLoad={() => setMediaLoading(false)}
                  />
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
                  {statusText}
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4">
            {gen.status === "error" && gen.errorMessage ? (
              <div className="bb-card p-4 border border-red-500/30 bg-red-500/10">
                <div className="text-sm font-semibold text-red-300">שגיאה</div>
                <div className="mt-1 text-sm text-white/90">{gen.errorMessage}</div>
              </div>
            ) : null}

            {confirmError ? (
              <div className="bb-card p-4 border border-red-500/30 bg-red-500/10">
                <div className="text-sm font-semibold text-red-300">שגיאה</div>
                <div className="mt-1 text-sm text-white/90">{confirmError}</div>
              </div>
            ) : null}

            <div className="bb-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <div className="text-sm font-semibold">
                    {gen.type === "image"
                      ? "תמונה לסושיאל"
                      : gen.type === "remotion"
                        ? "וידיוא בסיסי לסושיאל"
                        : "וידיוא פרימיום לסושיאל"}
                  </div>
                  <div className="text-xs text-white/60">{statusText}</div>
                </div>
                <div className="bb-pill">
                  <span className="bb-pill-dot" />
                  <span className="text-xs font-semibold">{gen.niche}</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs text-white/60">קופי</div>
                <div className="mt-1 whitespace-pre-line text-sm leading-7 text-white/80">
                  {captionOnly}
                </div>
                {tags.length ? (
                  <div className="mt-2 text-xs text-white/60 break-words">{tags.join(" ")}</div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {gen.autoUpload?.status === "pending_approval" || gen.autoUpload?.status === ("awaiting_approval" as any) ? (
                  <div className="bb-card p-3 bg-amber-400/10 border border-amber-400/20">
                    <div className="text-xs text-amber-200/90">ממתין לאישור לפני העלאה</div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="bb-btn bb-btn-primary text-sm"
                        onClick={async () => {
                          if (!user) return;
                          const token = await user.getIdToken();
                          const res = await fetch("/api/auto-upload/decision", {
                            method: "POST",
                            headers: {
                              "content-type": "application/json",
                              ...(token ? { authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ genId: gen.id, decision: "approve" }),
                          });
                          const data = (await res.json().catch(() => null)) as any;
                          if (!res.ok) {
                            push({ type: "error", title: "שגיאה", description: data?.error ?? "אישור נכשל" });
                            return;
                          }
                          push({ type: "success", title: "אושר", description: "העלאה התחילה" });
                        }}
                      >
                        אשר העלאה
                      </button>
                      <button
                        type="button"
                        className="bb-btn bb-btn-secondary text-sm"
                        onClick={async () => {
                          if (!user) return;
                          const token = await user.getIdToken();
                          const res = await fetch("/api/auto-upload/decision", {
                            method: "POST",
                            headers: {
                              "content-type": "application/json",
                              ...(token ? { authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ genId: gen.id, decision: "reject" }),
                          });
                          const data = (await res.json().catch(() => null)) as any;
                          if (!res.ok) {
                            push({ type: "error", title: "שגיאה", description: data?.error ?? "דחייה נכשלה" });
                            return;
                          }
                          push({ type: "success", title: "נדחה", description: "לא יעלה לרשתות" });
                        }}
                      >
                        דחה
                      </button>
                    </div>
                  </div>
                ) : null}
                {gen.resultUrl ? (
                  <button
                    type="button"
                    className="bb-btn bb-btn-primary w-full text-sm"
                    onClick={async () => {
                      await copyToClipboard(captionForCopy);
                      window.open(gen.resultUrl!, "_blank", "noopener");
                      push({
                        type: "success",
                        title: "פוסט מהיר",
                        description: "הקופי הועתק והקובץ נפתח. מוכן להדבקה ולהעלאה",
                      });
                    }}
                  >
                    פוסט מהיר
                  </button>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="bb-btn bb-btn-secondary text-sm"
                    onClick={async () => {
                      await copyToClipboard(captionForCopy);
                      push({ type: "success", title: "הקופי הועתק" });
                    }}
                  >
                    העתק קופי
                  </button>
                  {gen.resultUrl ? (
                    <button
                      type="button"
                      className="bb-btn bb-btn-primary text-sm"
                      onClick={async () => {
                        const lower = gen.resultUrl!.toLowerCase();
                        const ext =
                          lower.includes(".mp4") ? "mp4" : lower.includes(".webm") ? "webm" : lower.includes(".png") ? "png" : "jpg";
                        await downloadAsset(gen.resultUrl!, `brandblitz-${gen.id}.${ext}`);
                      }}
                    >
                      הורדה
                    </button>
                  ) : (
                    <button type="button" className="bb-btn bb-btn-primary text-sm opacity-60" disabled>
                      הורדה
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bb-card p-5">
              <div className="text-sm font-semibold">מה הלאה?</div>
              <div className="mt-1 text-xs text-white/60">
                זה ה־Repost flow: קופי {"→"} הורדה {"→"} העלאה לאינסטגרם/טיקטוק.
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/35 backdrop-blur-[1px]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
    </div>
  );
}

