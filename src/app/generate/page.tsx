"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getClientAuth, getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { AppShell } from "@/components/AppShell";
import type { GenerationDoc } from "@/lib/types";
import type { GenerationType } from "@/lib/credits";
import { CREDIT_COST } from "@/lib/credits";
import { useSession } from "@/app/providers";
import Link from "next/link";

type ApiOk = { genId: string };
type ApiErr = { error: string };
type ImproveOk = { improved: string; warning?: string };

const TYPE_OPTIONS: Array<{ id: GenerationType; label: string; hint: string }> = [
  { id: "image", label: "תמונה לסושיאל", hint: "" },
  { id: "remotion", label: "וידיוא בסיסי לסושיאל", hint: "" },
  { id: "premium", label: "וידיוא פרימיום לסושיאל", hint: "" },
];

const FORMAT_OPTIONS: Array<{ id: "9:16" | "1:1" | "16:9"; label: string; hint: string }> = [
  { id: "9:16", label: "סטורי / טיקטוק", hint: "אנכי מלא" },
  { id: "1:1", label: "פוסט אינסטגרם", hint: "ריבוע" },
  { id: "16:9", label: "וידאו למחשב", hint: "אופקי" },
];

export type VideoStyleValue =
  | "ugc_viral"
  | "cinematic"
  | "business_professional"
  | "product_showcase"
  | "lifestyle"
  | "custom";

const VIDEO_STYLE_OPTIONS: Array<{ value: VideoStyleValue; label: string }> = [
  { value: "ugc_viral", label: "UGC / TikTok Viral" },
  { value: "cinematic", label: "Professional Cinematic" },
  { value: "business_professional", label: "Modern Business" },
  { value: "product_showcase", label: "Product Showcase" },
  { value: "lifestyle", label: "Lifestyle & Atmosphere" },
  { value: "custom", label: "Custom Style" },
];

function isVideoUrl(url: string) {
  const u = url.toLowerCase();
  return u.endsWith(".mp4") || u.includes("video") || u.includes(".webm");
}

function aspectClass(ar: string | null | undefined) {
  if (ar === "1:1") return "aspect-[1/1]";
  if (ar === "16:9") return "aspect-[16/9]";
  return "aspect-[9/16]";
}

const demoResultByType: Record<GenerationType, string> = {
  image:
    "https://images.unsplash.com/photo-1520975682038-4adf807d1d54?auto=format&fit=crop&w=1080&q=80",
  remotion:
    "https://images.unsplash.com/photo-1520975682038-4adf807d1d54?auto=format&fit=crop&w=1080&q=80",
  // Sample video for premium demo (short clip)
  premium:
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
};

export default function GeneratePage() {
  const { user, isDemo } = useSession();
  const [niche, setNiche] = useState("כללי");
  const [userRequest, setUserRequest] = useState("");
  const [improving, setImproving] = useState(false);
  const [improveHint, setImproveHint] = useState<string | null>(null);
  const [type, setType] = useState<GenerationType>("image");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [selectedStyle, setSelectedStyle] = useState<VideoStyleValue>("ugc_viral");
  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [genId, setGenId] = useState<string | null>(null);
  const [gen, setGen] = useState<(GenerationDoc & { id: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [credits, setCredits] = useState<number | null>(null);
  useEffect(() => {
    if (isDemo || !isFirebaseClientConfigured()) {
      setCredits(30);
      return;
    }
    if (!user) return;
    const db = getClientDb();
    const ref = doc(db, "users", user.uid, "credits", "summary");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const bal = (snap.data() as { balance?: number } | undefined)?.balance;
        setCredits(typeof bal === "number" ? bal : 0);
      },
      (err) => {
        if ((err as { code?: string } | null)?.code === "permission-denied") return;
        // eslint-disable-next-line no-console
        console.warn("[generate] credits listener error:", err);
      },
    );
    return () => unsub();
  }, [user, isDemo]);

  const cost = CREDIT_COST[type];

  useEffect(() => {
    if (!genId) return;
    const db = getClientDb();
    const ref = doc(db, "generations", genId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        setGen({ id: snap.id, ...(snap.data() as GenerationDoc) });
      },
      (err) => {
        if ((err as { code?: string } | null)?.code === "permission-denied") return;
        // eslint-disable-next-line no-console
        console.warn("[generate] generation listener error:", err);
      },
    );
    return () => unsub();
  }, [genId]);

  const statusLabel = useMemo(() => {
    if (!gen) return null;
    if (gen.status === "done") return "מוכן";
    if (gen.status === "error") return "שגיאה";
    if (gen.status === "rendering") return "מרנדר וידאו...";
    if (gen.status === "pending_review") return "ערוך טקסט ואישור";
    if (gen.type === "premium" && gen.status === "processing") return "מייצר וידאו AI...";
    return "מעבד...";
  }, [gen]);

  const isPendingReview = gen?.status === "pending_review" && gen?.type === "remotion";
  const [confirmingRender, setConfirmingRender] = useState(false);
  const [addCreditsLoading, setAddCreditsLoading] = useState(false);
  const [addCreditsMessage, setAddCreditsMessage] = useState<string | null>(null);
  // Legacy support: auto-confirm old pending_review remotion docs (no user click).
  useEffect(() => {
    if (!isPendingReview || !genId || !user || confirmingRender) return;
    setConfirmingRender(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        await fetch(`/api/generations/${genId}/confirm-render`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ overlayText: (gen?.overlayText ?? "").trim() || "כותרת" }),
        });
      } finally {
        setConfirmingRender(false);
      }
    })();
  }, [isPendingReview, genId, user, confirmingRender, gen?.overlayText]);

  const [mediaLoading, setMediaLoading] = useState(false);
  useEffect(() => {
    if (gen?.resultUrl) setMediaLoading(true);
  }, [gen?.resultUrl]);

  return (
    <AppShell
      title="יצירה חדשה"
      right={
        <div className="bb-card px-4 py-2">
          <div className="text-[11px] text-white/60">יתרת קרדיטים</div>
          <div className="text-lg font-semibold leading-6">{credits === null ? "…" : credits}</div>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="bb-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <div className="text-sm font-semibold">פרטים</div>
              <div className="text-xs text-white/60">הגדר את העסק ומה אתה רוצה לייצר</div>
            </div>
            <div className="bb-pill">
              <span className="bb-pill-dot" />
              <span className="text-xs font-semibold">
                עלות: {cost} קרדיטים
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1">
              <div className="text-xs text-white/60">תחום העסק</div>
              <input
                className="bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="למשל: מסעדות, נדל״ן, עורכי דין, רופאי שיניים..."
              />
            </label>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-white/60">מה בדיוק אתה רוצה שיהיה בתוכן</div>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary text-xs px-3 py-2"
                  disabled={improving || !userRequest.trim() || !user}
                  onClick={async () => {
                    if (!user || !userRequest.trim()) return;
                    setImproving(true);
                    setImproveHint(null);
                    setError(null);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch("/api/prompt-improve", {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                          ...(token ? { authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ text: userRequest, niche, type }),
                      });
                      if (!res.ok) {
                        const data = (await res.json().catch(() => null)) as ApiErr | null;
                        throw new Error(data?.error ?? "שיפור הטקסט נכשל");
                      }
                      const data = (await res.json()) as ImproveOk;
                      setUserRequest(data.improved);
                      if (data.warning) setImproveHint(data.warning);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "שגיאה");
                    } finally {
                      setImproving(false);
                    }
                  }}
                  title="AI: שפר את הטקסט"
                >
                  <span className="inline-flex items-center gap-1">
                    <SparklesIcon />
                    {improving ? "משפר..." : "שפר עם AI"}
                  </span>
                </button>
              </div>
              <textarea
                className="bb-card bb-input w-full min-h-[110px] rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm resize-y outline-none"
                value={userRequest}
                onChange={(e) => setUserRequest(e.target.value)}
                placeholder="לדוגמה: אני רוצה פרסומת לעסק ההמבורגרים שלי עם אווירה טרנדית, דגש על מבצע השבוע וקריאה לפעולה."
                dir="rtl"
              />
              {improveHint ? <div className="text-xs text-white/60">{improveHint}</div> : null}
              {error ? <div className="text-sm text-red-300">{error}</div> : null}
            </div>

            <div className="grid gap-2">
              <div className="text-xs text-white/60">פורמט (יחס תמונה)</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((opt) => {
                  const active = opt.id === aspectRatio;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={[
                        "bb-card bb-card-interactive text-right p-3 transition",
                        active ? "bb-card-selected" : "",
                      ].join(" ")}
                      onClick={() => setAspectRatio(opt.id)}
                      aria-pressed={active}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      <div className="mt-1 text-xs text-white/60">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-xs text-white/60">סוג תוכן</div>
              {type === "premium" ? (
                <div className="text-xs text-white/50 rounded-lg bg-white/5 px-3 py-2 border border-white/10">
                  וידאו גנרטיבי – יגיע מ-Veo/Kling (לאחר הגדרת ענף Premium ב-Make).
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-3">
                {TYPE_OPTIONS.map((opt) => {
                  const active = opt.id === type;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={[
                        "bb-card bb-card-interactive text-right p-3 transition",
                        active ? "bb-card-selected" : "",
                      ].join(" ")}
                      onClick={() => setType(opt.id)}
                      aria-pressed={active}
                    >
                      <div className="text-sm font-semibold">{opt.label}</div>
                      {opt.hint ? <div className="mt-1 text-xs text-white/60">{opt.hint}</div> : null}
                      <div className="mt-2 text-xs text-white/70">
                        עלות: <span className="font-semibold">{CREDIT_COST[opt.id]}</span> קרדיטים
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {type === "premium" ? (
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <div className="text-xs text-white/60">
                    סגנון וידאו (Video Style) <span className="text-cyan-400/80">*</span>
                  </div>
                  <select
                    className="bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-cyan-400/50"
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value as VideoStyleValue)}
                    required
                    dir="ltr"
                  >
                    {VIDEO_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedStyle === "custom" ? (
                  <label className="grid gap-1">
                    <div className="text-xs text-white/60">סגנון מותאם אישית (Custom Prompt)</div>
                    <textarea
                      className="bb-card bb-input w-full min-h-[100px] rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm resize-y outline-none focus:border-cyan-400/50"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="תאר כאן את הסגנון המדויק שתרצה (למשל: תאורה כחולה, תנועות מהירות, אווירה קצבית...)"
                      dir="rtl"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
              <button
                type="button"
                className="bb-btn bb-btn-secondary order-2 sm:order-1 min-h-[48px] flex-1 sm:flex-none"
                disabled={isSubmitting || addCreditsLoading || isDemo || !user}
                onClick={async () => {
                  if (isDemo || !user) return;
                  setAddCreditsMessage(null);
                  setError(null);
                  setAddCreditsLoading(true);
                  try {
                    const token = await user.getIdToken();
                    const res = await fetch("/api/credits/add-test", {
                      method: "POST",
                      headers: token ? { authorization: `Bearer ${token}` } : {},
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      throw new Error(data?.error ?? `שגיאה (${res.status})`);
                    }
                    setAddCreditsMessage(
                      `נוספו ${data.added ?? 10} קרדיטים. יתרה: ${data.balance ?? "לא ידוע"}`,
                    );
                    setTimeout(() => setAddCreditsMessage(null), 4000);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "הוספת קרדיטים נכשלה");
                  } finally {
                    setAddCreditsLoading(false);
                  }
                }}
                title="זמני לבדיקות – מוסיף 10 קרדיטים (דורש ALLOW_TEST_CREDITS=true)"
              >
                {addCreditsLoading ? "…" : "+10 קרדיטים"}
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-primary w-full min-h-[48px] sm:flex-1"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                onClick={async () => {
                  setError(null);
                  setIsSubmitting(true);
                  try {
                    if (isDemo || !isFirebaseClientConfigured()) {
                      const newId = `demo-${Math.random().toString(16).slice(2)}`;
                      setGenId(newId);
                      setGen({
                        id: newId,
                        userId: "demo-user",
                        niche,
                        type,
                        logoUrl: null,
                        status: "processing",
                        createdAt: Date.now(),
                        resultUrl: null,
                        caption: null,
                        overlayText:
                          type === "image"
                            ? "כותרת בעברית שיושבת מושלם\nעל התמונה (שכבה)"
                            : null,
                        errorMessage: null,
                      });

                      window.setTimeout(() => {
                        setGen((prev) =>
                          prev
                            ? {
                                ...prev,
                                status: "done",
                                resultUrl: demoResultByType[type],
                                caption:
                                  "קופי לדוגמה בעברית: קצר, חד, ומוכן לריפוסט. #BrandBlitz",
                              }
                            : prev,
                        );
                      }, 1400);
                      return;
                    }

                    const auth = getClientAuth();
                    const token = await auth.currentUser?.getIdToken?.();
                    const res = await fetch("/api/generate", {
                      method: "POST",
                      headers: {
                        "content-type": "application/json",
                        ...(token ? { authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({
                        niche,
                        userRequest: userRequest.trim() || null,
                        type,
                        aspectRatio,
                        logoUrl: null,
                        ...(type === "premium"
                          ? {
                              selectedStyle,
                              customPrompt: selectedStyle === "custom" ? (customPrompt ?? "").trim() : "",
                            }
                          : {}),
                        userId: auth.currentUser?.uid ?? null,
                      }),
                    });

                    if (!res.ok) {
                      const data = (await res.json().catch(() => null)) as ApiErr | null;
                      throw new Error(data?.error ?? `Request failed (${res.status})`);
                    }
                    const data = (await res.json()) as ApiOk;
                    setGenId(data.genId);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "שגיאה לא צפויה");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
              >
                {isSubmitting ? "מכין..." : "צור עכשיו"}
              </button>

              <button
                type="button"
                className="bb-btn bb-btn-secondary w-full min-h-[48px]"
                onClick={() => {
                  setGenId(null);
                  setGen(null);
                  setError(null);
                  setCustomPrompt("");
                }}
              >
                איפוס
              </button>
            </div>

            {addCreditsMessage ? (
              <div className="text-sm text-cyan-300">{addCreditsMessage}</div>
            ) : null}
            {error ? <div className="text-sm text-red-300">{error}</div> : null}
          </div>
        </section>

        <section className="bb-card p-4 sm:p-5">
          {!genId && !isSubmitting ? (
            <div className="text-sm text-white/70">אחרי שתלחץ “צור עכשיו”, התוצאה תופיע כאן.</div>
          ) : (
            <div className="grid gap-3">
              {gen?.status === "error" ? (
                <div className="bb-card p-3 text-sm text-red-300">
                  {gen.errorMessage ?? "התרחשה שגיאה בתהליך."}
                </div>
              ) : null}

              <div className="bb-card overflow-hidden">
                <div className={["relative w-full bg-white/5", aspectClass(gen?.aspectRatio ?? aspectRatio)].join(" ")}>
                  {gen?.resultUrl ? (
                    isVideoUrl(gen.resultUrl) ? (
                      <>
                        {mediaLoading ? <LoadingOverlay label="טוען וידאו..." /> : null}
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
                        {mediaLoading ? <LoadingOverlay label="טוען תמונה..." /> : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={gen.resultUrl}
                          alt="תוצאה"
                          className="h-full w-full object-cover"
                          onLoad={() => setMediaLoading(false)}
                        />
                      </>
                    )
                  ) : (
                    <>
                      <LoadingOverlay
                        label={
                          gen?.status === "rendering"
                            ? "מרנדר וידאו..."
                            : gen?.type === "premium"
                              ? "מייצר וידאו..."
                              : "מייצר תמונה..."
                        }
                      />
                      <div className="flex h-full w-full items-center justify-center text-sm text-white/0">.</div>
                    </>
                  )}
                </div>

                <div className="p-4">
                  <div className="text-xs text-white/60">קופי</div>
                  <div className="mt-1 text-sm text-white/80">{(gen?.caption ?? "עוד רגע...").trim()}</div>
                  {gen?.hashtags?.length ? (
                    <div className="mt-2 text-xs text-white/60 break-words">{gen.hashtags.join(" ")}</div>
                  ) : null}
                </div>
              </div>

              {gen?.resultUrl ? (
                <div className="flex gap-2">
                  <a className="bb-btn bb-btn-primary flex-1" href={gen.resultUrl} target="_blank" rel="noreferrer">
                    פתח תוצאה
                  </a>
                  <Link className="bb-btn bb-btn-secondary flex-1" href={`/g/${genId}`}>
                    פתח עמוד יצירה
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/35 backdrop-blur-[1px]">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
        <span className="text-sm text-white/80">{label}</span>
      </div>
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2l1.2 4.2L17 7.5l-3.8 1.3L12 13l-1.2-4.2L7 7.5l3.8-1.3L12 2z"
        fill="rgba(233,238,252,0.95)"
      />
      <path
        d="M19 11l.8 2.8L22 15l-2.2.7L19 18l-.8-2.3L16 15l2.2-1.2L19 11z"
        fill="rgba(255,64,181,0.9)"
      />
      <path
        d="M5 12l.7 2.4L8 15l-2.3.8L5 18l-.7-2.2L2 15l2.3-.6L5 12z"
        fill="rgba(0,245,255,0.9)"
      />
    </svg>
  );
}

