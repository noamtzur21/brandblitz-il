"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GenerationDoc } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { useSession } from "@/app/providers";

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

export function GenerationCard({ gen }: { gen: GenerationDoc & { id: string } }) {
  const { push } = useToast();
  const { user } = useSession();
  const caption = formatCaptionWithHashtags(gen) || "קופי לדוגמה";
  const hasResult = !!gen.resultUrl;
  const [mediaLoading, setMediaLoading] = useState(false);
  const [quickPostOpen, setQuickPostOpen] = useState(false);
  const [quickPostBusy, setQuickPostBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  useEffect(() => {
    if (gen.resultUrl) setMediaLoading(true);
  }, [gen.resultUrl]);

  async function downloadAsset(url: string) {
    const lower = url.toLowerCase();
    const ext =
      lower.includes(".mp4") ? "mp4" : lower.includes(".webm") ? "webm" : lower.includes(".png") ? "png" : "jpg";
    const filename = `brandblitz-${gen.id}.${ext}`;
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

  async function runQuickPost(dest: {
    platform: "instagram" | "facebook";
    placement: "post" | "reels" | "story";
  }) {
    if (!gen.resultUrl) return;
    if (!user) {
      push({ type: "error", title: "צריך להתחבר", description: "התחבר/י כדי לפרסם" });
      return;
    }
    setQuickPostBusy(true);
    try {
      const token = await user.getIdToken();
      const call = async (payload: any) => {
        const r = await fetch("/api/quick-post", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        const d = (await r.json().catch(() => null)) as any;
        return { r, d };
      };

      // First attempt
      let { r: res, d: data } = await call({ genId: gen.id, destination: dest });
      if (res.status === 202 && data?.creationId && dest.platform === "instagram") {
        const creationId = String(data.creationId);
        push({ type: "success", title: "בתהליך", description: "אינסטגרם מעבד את המדיה… מפרסמים אוטומטית כשמוכן." });
        // Poll in browser until ready (avoid server timeouts)
        for (let i = 0; i < 45; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          ({ r: res, d: data } = await call({
            genId: gen.id,
            destination: dest,
            resume: { creationId },
          }));
          if (res.status === 202) continue;
          break;
        }
      }

      if (!res.ok) throw new Error(data?.error ?? "פרסום נכשל");

      push({
        type: "success",
        title: "הועלה בהצלחה",
        description:
          dest.platform === "instagram"
            ? dest.placement === "reels"
              ? "רילס הועלה לאינסטגרם"
              : dest.placement === "story"
                ? "סטורי הועלה לאינסטגרם"
                : "פוסט הועלה לאינסטגרם"
            : dest.placement === "story"
              ? "סטורי הועלה לפייסבוק"
              : "פוסט הועלה לפייסבוק",
      });
    } catch (e) {
      push({
        type: "error",
        title: "פרסום נכשל",
        description: e instanceof Error ? e.message : "שגיאה לא ידועה",
      });
    } finally {
      setQuickPostBusy(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    const token = await user.getIdToken?.();
    const res = await fetch(`/api/generations/${gen.id}`, {
      method: "DELETE",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      push({ type: "success", title: "נמחק", description: "היצירה הוסרה מהפיד" });
    } else {
      const data = await res.json().catch(() => ({}));
      push({ type: "error", title: "מחיקה נכשלה", description: (data as { error?: string }).error ?? res.statusText });
    }
  }

  const awaitingApproval =
    gen.autoUpload?.status === "pending_approval" || gen.autoUpload?.status === ("awaiting_approval" as any);

  return (
    <div className="bb-card overflow-hidden block flex flex-col">
      <Link href={`/g/${gen.id}`} className="block flex-1 min-w-0">
        <div className={["relative w-full bg-white/5", aspectClass(gen.aspectRatio)].join(" ")}>
          {hasResult ? (
            isVideoUrl(gen.resultUrl!) ? (
              <>
                {mediaLoading ? <LoadingOverlay /> : null}
                <video
                  className="h-full w-full object-cover"
                  src={gen.resultUrl!}
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
                  src={gen.resultUrl!}
                  alt="נכס שנוצר"
                  className="h-full w-full object-cover"
                  onLoad={() => setMediaLoading(false)}
                />
              </>
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/60">
              {gen.status === "processing"
                ? "מעבד..."
                : gen.status === "pending_review"
                  ? "ערוך טקסט → רנדר"
                  : gen.status === "rendering"
                    ? "מרנדר וידאו..."
                    : "ממתין לתוצאה"}
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <div className="text-sm font-semibold">
                {gen.type === "image"
                  ? "תמונה לסושיאל"
                  : gen.type === "remotion"
                    ? "וידיוא בסיסי לסושיאל"
                    : "וידיוא פרימיום לסושיאל"}
              </div>
              <div className="text-xs text-white/60">{gen.niche}</div>
            </div>
            <div className="text-xs text-white/60">
              {gen.status === "done"
                ? "מוכן"
                : gen.status === "error"
                  ? "שגיאה"
                  : gen.status === "pending_review"
                    ? "עריכה"
                    : gen.status === "rendering"
                      ? "רינדור"
                      : "בתהליך"}
              {gen.status === "error" && gen.errorMessage ? (
                <span className="mt-1 block text-red-300/90 line-clamp-1">{gen.errorMessage}</span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>

      <div className="p-4 pt-0 flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          {awaitingApproval ? (
            <div className="bb-card p-3 bg-amber-400/10 border border-amber-400/20">
              <div className="text-xs text-amber-200/90">ממתין לאישור לפני העלאה</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="bb-btn bb-btn-primary text-sm"
                  disabled={autoBusy || !user}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!user) return;
                    setAutoBusy(true);
                    try {
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
                      if (!res.ok) throw new Error(data?.error ?? "אישור נכשל");
                      push({ type: "success", title: "אושר", description: "העלאה התחילה" });
                    } catch (err) {
                      push({ type: "error", title: "שגיאה", description: err instanceof Error ? err.message : "שגיאה" });
                    } finally {
                      setAutoBusy(false);
                    }
                  }}
                >
                  אשר העלאה
                </button>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary text-sm"
                  disabled={autoBusy || !user}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!user) return;
                    setAutoBusy(true);
                    try {
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
                      if (!res.ok) throw new Error(data?.error ?? "דחייה נכשלה");
                      push({ type: "success", title: "נדחה", description: "לא יעלה לרשתות" });
                    } catch (err) {
                      push({ type: "error", title: "שגיאה", description: err instanceof Error ? err.message : "שגיאה" });
                    } finally {
                      setAutoBusy(false);
                    }
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
              onClick={async (e) => {
                e.preventDefault();
                setQuickPostOpen(true);
              }}
            >
              פוסט מהיר
            </button>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="bb-btn bb-btn-secondary flex-1 text-sm"
              onClick={async (e) => {
                e.preventDefault();
                await copyToClipboard(caption);
                push({ type: "success", title: "הקופי הועתק", description: "מוכן להדבקה באינסטגרם/טיקטוק" });
              }}
            >
              העתק קופי
            </button>
            {gen.resultUrl ? (
              <button
                type="button"
                className="bb-btn bb-btn-primary flex-1 text-sm"
                onClick={async (e) => {
                  e.preventDefault();
                  await downloadAsset(gen.resultUrl!);
                }}
              >
                הורדה
              </button>
            ) : (
              <button
                type="button"
                className="bb-btn bb-btn-primary flex-1 text-sm opacity-60"
                disabled
              >
                הורדה
              </button>
            )}
            <button
              type="button"
              className="bb-btn bb-btn-secondary text-sm p-2 shrink-0"
              onClick={handleDelete}
              title="מחק יצירה"
              aria-label="מחק יצירה"
            >
              <TrashIcon />
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-white/55 line-clamp-2">{caption}</div>
      </div>

      {quickPostOpen ? (
        <QuickPostModal
          onClose={() => setQuickPostOpen(false)}
          genResultUrl={gen.resultUrl ?? null}
          busy={quickPostBusy}
          onPick={async (dest) => {
            setQuickPostOpen(false);
            await runQuickPost(dest);
          }}
        />
      ) : null}
    </div>
  );
}

function QuickPostModal({
  onClose,
  onPick,
  genResultUrl,
  busy,
}: {
  onClose: () => void;
  onPick: (dest: { platform: "instagram" | "facebook"; placement: "post" | "reels" | "story" }) => Promise<void>;
  genResultUrl: string | null;
  busy: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [platform, setPlatform] = useState<"instagram" | "facebook" | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  if (!mounted) return null;
  const isVideo = genResultUrl ? isVideoUrl(genResultUrl) : false;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <div
          className="bb-card bb-neon w-full max-w-[520px] p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm font-semibold">פוסט מהיר</div>
          <div className="mt-1 text-xs text-white/60">בחר/י יעד ואז סוג פרסום.</div>

          {!platform ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="bb-btn bb-btn-secondary flex flex-col items-center justify-center gap-2 py-3"
                onClick={() => setPlatform("instagram")}
              >
                <InstagramIcon />
                <span className="text-xs font-semibold">אינסטגרם</span>
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-secondary flex flex-col items-center justify-center gap-2 py-3"
                onClick={() => setPlatform("facebook")}
              >
                <FacebookIcon />
                <span className="text-xs font-semibold">פייסבוק</span>
              </button>
            </div>
          ) : (
            <>
              <div className="mt-3 text-xs text-white/60">
                נבחר: <span className="font-semibold">{platform === "instagram" ? "אינסטגרם" : "פייסבוק"}</span>
                <button type="button" className="underline underline-offset-4 ml-2" onClick={() => setPlatform(null)}>
                  שנה
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {platform === "instagram" ? (
                  <>
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary py-3"
                      disabled={busy || isVideo}
                      onClick={() => onPick({ platform: "instagram", placement: "post" })}
                      title={isVideo ? "פוסט כאן תומך בתמונה בלבד" : undefined}
                    >
                      <div className="text-xs font-semibold">פוסט</div>
                    </button>
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary py-3"
                      disabled={busy || !isVideo}
                      onClick={() => onPick({ platform: "instagram", placement: "reels" })}
                      title={!isVideo ? "רילס דורש וידאו" : undefined}
                    >
                      <div className="text-xs font-semibold">רילס</div>
                    </button>
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary py-3"
                      disabled={busy}
                      onClick={() => onPick({ platform: "instagram", placement: "story" })}
                    >
                      <div className="text-xs font-semibold">סטורי</div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary py-3 col-span-2"
                      disabled={busy}
                      onClick={() => onPick({ platform: "facebook", placement: "post" })}
                    >
                      <div className="text-xs font-semibold">פוסט</div>
                    </button>
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary py-3"
                      disabled={busy}
                      onClick={() => onPick({ platform: "facebook", placement: "story" })}
                    >
                      <div className="text-xs font-semibold">סטורי</div>
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <button type="button" className="bb-btn bb-btn-secondary mt-4 w-full" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/35 backdrop-blur-[1px]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden />
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="ig" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffdc80" />
          <stop offset="0.35" stopColor="#fc7a57" />
          <stop offset="0.7" stopColor="#d62976" />
          <stop offset="1" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="none" stroke="url(#ig)" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="url(#ig)" strokeWidth="2" />
      <circle cx="16.9" cy="7.3" r="1" fill="url(#ig)" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M14 8h2V5h-2c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.3l.7-3H13V9c0-.6.4-1 1-1z"
        fill="rgba(233,238,252,0.9)"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

