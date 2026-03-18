"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/app/providers";
import type { AutoUploadSettingsDoc, BrandKitDoc } from "@/lib/types";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";

const DEFAULT_COLOR = "#00f5ff";
const DEFAULT_TZ = "Asia/Jerusalem" as const;

function clampInt(n: number, min: number, max: number) {
  const x = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.max(min, Math.min(max, x));
}

function parseTimeSlotsWithOverrides(input: string): { timeSlots: string[]; slotTypes: Record<string, "image" | "remotion" | "premium"> } {
  const items = input
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const timeSlots: string[] = [];
  const slotTypes: Record<string, "image" | "remotion" | "premium"> = {};

  for (const raw of items) {
    const parts = raw.split(/\s+/g).filter(Boolean);
    const t = parts[0] || "";
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const hh = clampInt(Number(m[1]), 0, 23);
    const mm = clampInt(Number(m[2]), 0, 59);
    const hhmm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    timeSlots.push(hhmm);

    const maybeType = (parts[1] || "").toLowerCase();
    const normalized =
      maybeType === "image"
        ? "image"
        : maybeType === "remotion"
          ? "remotion"
          : maybeType === "premium"
            ? "premium"
            : null;
    if (normalized) slotTypes[hhmm] = normalized;
  }

  // de-dupe but keep order
  const seen = new Set<string>();
  const uniq = timeSlots.filter((t) => {
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });

  // Drop overrides for slots not present
  for (const k of Object.keys(slotTypes)) {
    if (!seen.has(k)) delete slotTypes[k];
  }

  return { timeSlots: uniq, slotTypes };
}

const DEST_OPTIONS = [
  { id: "ig_post", label: "אינסטגרם — פוסט", platform: "instagram", placement: "post" },
  { id: "ig_reels", label: "אינסטגרם — רילס", platform: "instagram", placement: "reels" },
  { id: "ig_story", label: "אינסטגרם — סטורי", platform: "instagram", placement: "story" },
  { id: "fb_post", label: "פייסבוק — פוסט", platform: "facebook", placement: "post" },
  { id: "fb_story", label: "פייסבוק — סטורי", platform: "facebook", placement: "story" },
] as const;

function parseHexColor(s: string): string {
  const t = s.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t}`;
  return DEFAULT_COLOR;
}

export default function SettingsPage() {
  const { user, isReady, isDemo } = useSession();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [metaStatus, setMetaStatus] = useState<{
    connected: boolean;
    pageName?: string | null;
    igUsername?: string | null;
    expiresAt?: number | null;
  } | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaPages, setMetaPages] = useState<
    Array<{ pageId: string; pageName: string | null; hasIg: boolean; igUserId: string | null }>
  >([]);
  const [selectedMetaPageId, setSelectedMetaPageId] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Auto upload
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoRequireApproval, setAutoRequireApproval] = useState(true);
  const [autoNiche, setAutoNiche] = useState("כללי");
  const [autoTemplate, setAutoTemplate] = useState("");
  const [autoPostsPerDay, setAutoPostsPerDay] = useState(3);
  const [autoTimeSlotsText, setAutoTimeSlotsText] = useState("09:00, 13:00, 19:00");
  const [autoMixImage, setAutoMixImage] = useState(2);
  const [autoMixRemotion, setAutoMixRemotion] = useState(1);
  const [autoMixPremium, setAutoMixPremium] = useState(0);
  const [autoDestIds, setAutoDestIds] = useState<string[]>(["ig_post", "ig_story"]);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  // Daily Pulse
  const [todayPosts, setTodayPosts] = useState<
    Array<{
      id: string;
      scheduledAt: number;
      slot?: string | null;
      dayKey?: string | null;
      contentType: "image" | "remotion" | "premium";
      status: string;
      destination: { platform: "instagram" | "facebook"; placement: "post" | "reels" | "story" };
      generationId?: string | null;
      errorMessage?: string | null;
    }>
  >([]);
  const [todayBusyId, setTodayBusyId] = useState<string>("");
  const [todayError, setTodayError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !isFirebaseClientConfigured() || !user) return;
    const db = getClientDb();
    const ref = doc(db, "users", user.uid, "brandKit", "settings");
    getDoc(ref).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as BrandKitDoc;
      if (d.logoUrl != null) setLogoUrl(d.logoUrl);
      if (d.primaryColor != null) setPrimaryColor(parseHexColor(d.primaryColor));
    });
  }, [user, isDemo]);

  useEffect(() => {
    if (isDemo || !isFirebaseClientConfigured() || !user) return;
    const db = getClientDb();
    const ref = doc(db, "users", user.uid, "autoUpload", "settings");
    getDoc(ref).then((snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as Partial<AutoUploadSettingsDoc>;
      setAutoEnabled(!!d.enabled);
      setAutoRequireApproval(d.requireApproval ?? true);
      if (typeof d.niche === "string" && d.niche.trim()) setAutoNiche(d.niche.trim());
      if (typeof d.userRequestTemplate === "string") setAutoTemplate(d.userRequestTemplate);
      if (typeof d.postsPerDay === "number") setAutoPostsPerDay(clampInt(d.postsPerDay, 1, 12));
      if (Array.isArray(d.timeSlots) && d.timeSlots.length) {
        const overrides = (d.slotTypes && typeof d.slotTypes === "object" ? d.slotTypes : {}) as Record<string, any>;
        const text = d.timeSlots
          .map((t) => {
            const ov = overrides?.[t];
            const ty = ov === "image" || ov === "remotion" || ov === "premium" ? String(ov) : "";
            return ty ? `${t} ${ty}` : t;
          })
          .join(", ");
        setAutoTimeSlotsText(text);
      }
      if (d.mix) {
        if (typeof d.mix.image === "number") setAutoMixImage(clampInt(d.mix.image, 0, 12));
        if (typeof d.mix.remotion === "number") setAutoMixRemotion(clampInt(d.mix.remotion, 0, 12));
        if (typeof d.mix.premium === "number") setAutoMixPremium(clampInt(d.mix.premium, 0, 12));
      }
      if (Array.isArray(d.destinations) && d.destinations.length) {
        const ids: string[] = [];
        for (const dest of d.destinations) {
          const p = (dest as any)?.platform;
          const pl = (dest as any)?.placement;
          const id =
            p === "instagram" && pl === "post"
              ? "ig_post"
              : p === "instagram" && pl === "reels"
                ? "ig_reels"
                : p === "instagram" && pl === "story"
                  ? "ig_story"
                  : p === "facebook" && pl === "post"
                    ? "fb_post"
                    : p === "facebook" && pl === "story"
                      ? "fb_story"
                      : null;
          if (id) ids.push(id);
        }
        if (ids.length) setAutoDestIds(ids);
      }
    });
  }, [user, isDemo]);

  useEffect(() => {
    if (isDemo || !isFirebaseClientConfigured() || !user) {
      setTodayPosts([]);
      setTodayError(null);
      return;
    }
    const db = getClientDb();
    const q = query(collection(db, "scheduledPosts"), where("userId", "==", user.uid), orderBy("scheduledAt", "asc"));
    const tz = DEFAULT_TZ;
    const unsub = onSnapshot(
      q,
      (snap) => {
        const localNow = DateTime.now().setZone(tz);
        const todayKey = localNow.toFormat("yyyyLLdd");
        const rows: any[] = [];
        for (const d of snap.docs) {
          const data = d.data() as any;
          const dk = data?.dayKey != null ? String(data.dayKey) : "";
          const scheduledAt = typeof data?.scheduledAt === "number" ? Number(data.scheduledAt) : 0;
          const computedDayKey = scheduledAt ? DateTime.fromMillis(scheduledAt, { zone: tz }).toFormat("yyyyLLdd") : "";
          if ((dk && dk !== todayKey) || (!dk && computedDayKey !== todayKey)) continue;

          const destination = data?.destination as any;
          const platform = destination?.platform;
          const placement = destination?.placement;
          if (platform !== "instagram" && platform !== "facebook") continue;
          if (placement !== "post" && placement !== "reels" && placement !== "story") continue;

          const contentType = data?.contentType;
          if (contentType !== "image" && contentType !== "remotion" && contentType !== "premium") continue;

          rows.push({
            id: d.id,
            scheduledAt,
            slot: data?.slot != null ? String(data.slot) : null,
            dayKey: dk || computedDayKey || null,
            contentType,
            status: String(data?.status || ""),
            destination: { platform, placement },
            generationId: data?.generationId != null ? String(data.generationId) : null,
            errorMessage: data?.errorMessage != null ? String(data.errorMessage) : null,
          });
        }
        setTodayPosts(rows);
        setTodayError(null);
      },
      (err) => {
        setTodayError(err?.message || "שגיאה בטעינת תזמון היום");
      },
    );
    return () => unsub();
  }, [user, isDemo]);

  useEffect(() => {
    if (isDemo || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/me", {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) setIsAdmin(false);
          return;
        }
        const data = (await res.json().catch(() => null)) as { isAdmin?: boolean } | null;
        if (!cancelled) setIsAdmin(!!data?.isAdmin);
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDemo]);

  useEffect(() => {
    if (!user || isDemo) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/integrations/meta/status", {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          if (!cancelled) setMetaStatus({ connected: false });
          return;
        }
        if (!cancelled) setMetaStatus(data);
      } catch {
        if (!cancelled) setMetaStatus({ connected: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDemo, saved]);

  useEffect(() => {
    if (!user || isDemo || !metaStatus?.connected) {
      setMetaPages([]);
      setSelectedMetaPageId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/integrations/meta/pages", {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) return;
        const pages = Array.isArray(data?.pages) ? data.pages : [];
        if (!cancelled) {
          setMetaPages(
            pages
              .map((p: any) => ({
                pageId: String(p.pageId ?? ""),
                pageName: p.pageName != null ? String(p.pageName) : null,
                hasIg: !!p.hasIg,
                igUserId: p.igUserId != null ? String(p.igUserId) : null,
              }))
              .filter((p: any) => p.pageId),
          );
          const current = String(data?.current?.pageId ?? "");
          setSelectedMetaPageId(current);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDemo, metaStatus?.connected]);

  const handleSave = async () => {
    if (!user || isDemo || !isFirebaseClientConfigured()) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return;
    }
    setSaving(true);
    try {
      const db = getClientDb();
      const ref = doc(db, "users", user.uid, "brandKit", "settings");
      await setDoc(ref, {
        logoUrl: logoUrl.trim() || null,
        primaryColor: primaryColor.trim() || null,
        updatedAt: Date.now(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const token = await user.getIdToken();
      const res = await fetch("/api/upload-media", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "העלאת לוגו נכשלה");
      }
      const data = (await res.json()) as { urls: string[] };
      if (data.urls?.[0]) setLogoUrl(data.urls[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  if (!isReady) {
    return (
      <AppShell title="הגדרות משתמש" subtitle="טוען...">
        <div className="bb-card p-6 text-center text-white/70">טוען...</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="הגדרות משתמש">
      <div className="max-w-lg space-y-6">
        <section className="bb-card p-5">
          <div className="text-sm font-semibold mb-4">החשבון שלך</div>
          <div className="grid gap-2 text-sm text-white/80">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-white/60">אימייל</span>
              <span className="font-semibold">{user?.email ?? "לא קיים"}</span>
            </div>
          </div>
        </section>

        <section className="bb-card p-5">
          <div className="text-sm font-semibold mb-4">חיבור אינסטגרם / פייסבוק</div>
          <div className="text-xs text-white/60 leading-6">
            כדי להעלות אוטומטית, צריך חשבון <span className="font-semibold">אינסטגרם מקצועי</span> שמחובר ל‑
            <span className="font-semibold">עמוד פייסבוק</span>.
          </div>

          <div className="mt-3 bb-card p-3 bg-white/5 border border-white/10">
            <div className="text-xs text-white/60">סטטוס</div>
            <div className="mt-1 text-sm text-white/80">
              {metaStatus?.connected ? (
                <>
                  מחובר{metaStatus?.igUsername ? ` ל‑@${metaStatus.igUsername}` : ""}{metaStatus?.pageName ? ` (Page: ${metaStatus.pageName})` : ""}
                </>
              ) : (
                "לא מחובר"
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="bb-btn bb-btn-primary flex-1"
              disabled={metaBusy || !user || isDemo}
              onClick={async () => {
                if (!user) return;
                setMetaBusy(true);
                try {
                  const token = await user.getIdToken();
                  const res = await fetch("/api/integrations/meta/start", {
                    method: "POST",
                    headers: token ? { authorization: `Bearer ${token}` } : {},
                  });
                  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
                  if (!res.ok || !data?.url) throw new Error(data?.error ?? "לא ניתן להתחבר");
                  window.location.href = data.url;
                } catch (e) {
                  console.error(e);
                } finally {
                  setMetaBusy(false);
                }
              }}
            >
              {metaBusy ? "פותח..." : metaStatus?.connected ? "חבר מחדש" : "חבר חשבון"}
            </button>
            {metaStatus?.connected ? (
              <button
                type="button"
                className="bb-btn bb-btn-secondary"
                disabled={metaBusy || !user}
                onClick={async () => {
                  if (!user) return;
                  setMetaBusy(true);
                  try {
                    const token = await user.getIdToken();
                    await fetch("/api/integrations/meta/disconnect", {
                      method: "POST",
                      headers: token ? { authorization: `Bearer ${token}` } : {},
                    });
                    setMetaStatus({ connected: false });
                  } finally {
                    setMetaBusy(false);
                  }
                }}
              >
                נתק
              </button>
            ) : null}
          </div>

          {metaStatus?.connected && metaPages.length > 1 ? (
            <div className="mt-4 bb-card p-3 bg-white/5 border border-white/10">
              <div className="text-xs text-white/60 mb-2">בחר עמוד פייסבוק / אינסטגרם</div>
              <div className="flex gap-2">
                <select
                  className="bb-card bb-input flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  value={selectedMetaPageId}
                  onChange={(e) => setSelectedMetaPageId(e.target.value)}
                  disabled={metaBusy}
                >
                  {metaPages.map((p) => (
                    <option key={p.pageId} value={p.pageId}>
                      {(p.pageName ?? p.pageId) + (p.hasIg ? "" : " (ללא IG)")}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  disabled={metaBusy || !selectedMetaPageId}
                  onClick={async () => {
                    if (!user || !selectedMetaPageId) return;
                    setMetaBusy(true);
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch("/api/integrations/meta/select", {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                          ...(token ? { authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ pageId: selectedMetaPageId }),
                      });
                      const data = (await res.json().catch(() => null)) as any;
                      if (!res.ok) throw new Error(data?.error ?? "בחירה נכשלה");
                      setSaved(true);
                      setTimeout(() => setSaved(false), 800);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setMetaBusy(false);
                    }
                  }}
                >
                  שמור
                </button>
              </div>
              <div className="mt-2 text-[11px] text-white/55 leading-5">
                אם ללקוח יש כמה עמודים, כאן בוחרים לאיזה מהם לפרסם. עמוד בלי אינסטגרם מקצועי מחובר לא יאפשר פרסום לאינסטגרם.
              </div>
            </div>
          ) : null}
        </section>

        <section className="bb-card p-5">
          <div className="text-sm font-semibold mb-4">לוגו</div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleLogoChange}
          />
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <div className="relative">
                <img
                  src={logoUrl}
                  alt="לוגו"
                  className="h-20 w-20 object-contain rounded-lg border border-white/20 bg-white/5"
                />
                <button
                  type="button"
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500/90 text-white text-sm leading-none"
                  onClick={() => setLogoUrl("")}
                  aria-label="הסר לוגו"
                >
                  ×
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="bb-btn bb-btn-secondary"
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading ? "מעלה..." : logoUrl ? "החלף לוגו" : "העלה לוגו"}
            </button>
          </div>
          <p className="mt-2 text-xs text-white/50">
            מופיע כווטרמרק ובסוף הסרטון. לא “נצרב” לתוך תמונות במסלול תמונה (כדי לשמור על איכות נקייה).
          </p>
        </section>

        <section className="bb-card p-5">
          <div className="text-sm font-semibold mb-4">צבע מותג</div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-white/20 bg-transparent"
            />
            <input
              type="text"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#00f5ff"
              className="bb-card bb-input flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-mono"
            />
          </div>
          <p className="mt-2 text-xs text-white/50">
            משפיע על צבע הטקסט/כותרות בסרטון. אם תבחר צבע בהיר מאוד — נשתמש עדיין בצל/Stroke כדי שהטקסט יהיה קריא.
          </p>
        </section>

        <section className="bb-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">העלאה אוטומטית</div>
              <div className="mt-1 text-xs text-white/60 leading-6">
                קובע כמה פוסטים ביום, באיזה שעות (שעון ישראל), לאיזה פלטפורמות ומה סוג התוכן. צריך חיבור Meta פעיל כדי לפרסם.
              </div>
              <div className="mt-1 text-[11px] text-white/50 leading-5">
                שינויים בהגדרות משפיעים בעיקר על משימות שעדיין ב‑<span className="font-mono">scheduled</span>. אם כבר התחיל{" "}
                <span className="font-mono">generating</span>/<span className="font-mono">publishing</span> — התוכן כבר בתהליך.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoEnabled((v) => !v)}
              aria-pressed={autoEnabled}
              className={[
                "group inline-flex items-center gap-3 select-none rounded-full border px-3 py-2 transition",
                autoEnabled ? "border-emerald-400/25 bg-emerald-500/10" : "border-white/15 bg-white/5 hover:bg-white/7",
              ].join(" ")}
            >
              <span className={["text-xs font-semibold", autoEnabled ? "text-emerald-200" : "text-white/70"].join(" ")}>
                {autoEnabled ? "מופעל" : "כבוי"}
              </span>
              <span
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full border transition",
                  autoEnabled ? "border-emerald-400/25 bg-emerald-500/20" : "border-white/15 bg-white/10",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
                    autoEnabled ? "translate-x-5" : "translate-x-0.5",
                  ].join(" ")}
                />
              </span>
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-[11px] text-white/60">תחום העסק</div>
                <input
                  className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  value={autoNiche}
                  onChange={(e) => setAutoNiche(e.target.value)}
                  placeholder="לדוגמה: מסעדה / עורך דין / קוסמטיקה"
                  dir="rtl"
                />
              </div>

              <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="text-[11px] text-white/60">כמה פוסטים ביום</div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                  value={autoPostsPerDay}
                  onChange={(e) => setAutoPostsPerDay(clampInt(Number(e.target.value), 1, 12))}
                />
                <div className="mt-2 text-[11px] text-white/50">טיפ: התאימו את “חלוקת סוג תוכן” לסכום הזה.</div>
              </div>
            </div>

            <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-[11px] text-white/60">מה לייצר (תבנית בקשה)</div>
              <textarea
                className="mt-2 bb-card bb-input w-full min-h-[110px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none resize-y"
                value={autoTemplate}
                onChange={(e) => setAutoTemplate(e.target.value)}
                placeholder="לדוגמה: פוסטים שמדגישים מבצע השבוע + קריאה לפעולה. לשמור על טון מקצועי וקצר."
                dir="rtl"
              />
            </div>

            <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-white/60">שעות פרסום (שעון ישראל)</div>
                <div className="text-[11px] text-white/45 font-mono">{DEFAULT_TZ}</div>
              </div>
              <input
                className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                value={autoTimeSlotsText}
                onChange={(e) => setAutoTimeSlotsText(e.target.value)}
                placeholder="09:00, 13:00, 19:00"
                dir="ltr"
              />
              <div className="mt-2 text-[11px] text-white/55 leading-5">
                פורמט: <span className="font-mono">HH:MM</span> או{" "}
                <span className="font-mono">HH:MM premium</span>/<span className="font-mono">remotion</span>/
                <span className="font-mono">image</span>.
              </div>
            </div>

            <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="text-[11px] text-white/60">לאיזה פלטפורמות</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEST_OPTIONS.map((opt) => {
                  const checked = autoDestIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setAutoDestIds((prev) => {
                          const set = new Set(prev);
                          if (set.has(opt.id)) set.delete(opt.id);
                          else set.add(opt.id);
                          return Array.from(set);
                        });
                      }}
                      className={[
                        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                        checked
                          ? "border-cyan-400/30 bg-cyan-500/15 text-white"
                          : "border-white/10 bg-white/5 text-white/75 hover:bg-white/8",
                      ].join(" ")}
                      aria-pressed={checked}
                    >
                      <span
                        className={[
                          "inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold",
                          checked ? "border-cyan-400/30 bg-cyan-500/20 text-cyan-100" : "border-white/10 bg-white/5 text-white/60",
                        ].join(" ")}
                      >
                        {checked ? "✓" : "+"}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bb-card bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-white/60">חלוקת סוג תוכן ביום</div>
                <div className="text-[11px] text-white/45">
                  יעד: {autoPostsPerDay} · כרגע: {autoMixImage + autoMixRemotion + autoMixPremium}
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="bb-card bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-xs text-white/60">תמונות</div>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                    value={autoMixImage}
                    onChange={(e) => setAutoMixImage(clampInt(Number(e.target.value), 0, 12))}
                  />
                </div>
                <div className="bb-card bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-xs text-white/60">Remotion</div>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                    value={autoMixRemotion}
                    onChange={(e) => setAutoMixRemotion(clampInt(Number(e.target.value), 0, 12))}
                  />
                </div>
                <div className="bb-card bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="text-xs text-white/60">פרימיום</div>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    className="mt-2 bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none"
                    value={autoMixPremium}
                    onChange={(e) => setAutoMixPremium(clampInt(Number(e.target.value), 0, 12))}
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-white/55">
                מומלץ שהסכום יהיה שווה ל‑{autoPostsPerDay}. כרגע: {autoMixImage + autoMixRemotion + autoMixPremium}
              </div>
            </div>

            <label className="bb-card bg-white/5 border border-white/10 rounded-xl px-3 py-3 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={autoRequireApproval}
                onChange={(e) => setAutoRequireApproval(e.target.checked)}
              />
              <div>
                <div className="text-sm font-semibold">אישור לפני העלאה</div>
                <div className="mt-1 text-xs text-white/60 leading-6">
                  אם מסומן: המערכת תייצר את הנכס ותציג בדשבורד כפתור “אשר/דחה”. אם לא מסומן: יעלה אוטומטית.
                </div>
              </div>
            </label>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                className={[
                  "bb-btn bb-btn-primary w-full sm:w-auto",
                  "shadow-[0_0_0_1px_rgba(56,189,248,0.18),0_12px_30px_rgba(56,189,248,0.10)]",
                ].join(" ")}
                disabled={autoSaving || !user || isDemo || !isFirebaseClientConfigured()}
                onClick={async () => {
                  if (!user || isDemo || !isFirebaseClientConfigured()) return;
                  setAutoSaving(true);
                  setAutoError(null);
                  try {
                    const { timeSlots, slotTypes } = parseTimeSlotsWithOverrides(autoTimeSlotsText);
                    if (!timeSlots.length) throw new Error("חסר שעות להעלאה (HH:MM)");
                    const dests = DEST_OPTIONS.filter((o) => autoDestIds.includes(o.id)).map((o) => ({
                      platform: o.platform,
                      placement: o.placement,
                    }));
                    if (!dests.length) throw new Error("בחר/י לפחות יעד אחד");
                    const mixSum = autoMixImage + autoMixRemotion + autoMixPremium;
                    if (mixSum <= 0) throw new Error("חלוקת סוג תוכן חייבת להיות לפחות 1");

                    const db = getClientDb();
                    const ref = doc(db, "users", user.uid, "autoUpload", "settings");
                    const payload: AutoUploadSettingsDoc = {
                      enabled: autoEnabled,
                      requireApproval: autoRequireApproval,
                      niche: autoNiche.trim() || "כללי",
                      userRequestTemplate: autoTemplate ?? "",
                      postsPerDay: clampInt(autoPostsPerDay, 1, 12),
                      timeSlots,
                      slotTypes,
                      timeZone: DEFAULT_TZ,
                      destinations: dests as any,
                      mix: {
                        image: clampInt(autoMixImage, 0, 12),
                        remotion: clampInt(autoMixRemotion, 0, 12),
                        premium: clampInt(autoMixPremium, 0, 12),
                      },
                      updatedAt: Date.now(),
                    };
                    await setDoc(ref, payload, { merge: true });
                    setAutoSaved(true);
                    setTimeout(() => setAutoSaved(false), 2000);
                  } catch (e) {
                    setAutoError(e instanceof Error ? e.message : "שגיאה");
                  } finally {
                    setAutoSaving(false);
                  }
                }}
              >
                {autoSaving ? "שומר..." : "שמור הגדרות העלאה"}
              </button>
              <div className="flex items-center gap-3">
                {autoSaved ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                    נשמר ✓
                  </span>
                ) : null}
                {autoError ? (
                  <span className="inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-200">
                    {autoError}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="bb-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold">התזמון של היום</div>
              <div className="mt-1 text-xs text-white/60 leading-6">
                פס הייצור של התוכן שלך להיום (עדכון בזמן אמת מ‑Firestore).
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {todayError ? <div className="text-sm text-red-300">{todayError}</div> : null}
            {!todayError && !todayPosts.length ? (
              <div className="text-sm text-white/60">אין משימות להיום עדיין.</div>
            ) : null}

            {todayPosts.length ? (
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="text-left text-white/60">
                    <th className="py-2 pr-3">שעה</th>
                    <th className="py-2 pr-3">סוג תוכן</th>
                    <th className="py-2 pr-3 hidden sm:table-cell">יעד</th>
                    <th className="py-2 pr-3">סטטוס</th>
                    <th className="py-2 pr-0 text-right">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {todayPosts.map((p) => {
                    const t = p.slot
                      ? p.slot
                      : p.scheduledAt
                        ? DateTime.fromMillis(p.scheduledAt).setZone(DEFAULT_TZ).toFormat("HH:mm")
                        : "--:--";
                    const typeLabel =
                      p.contentType === "premium"
                        ? "פרימיום (Veo)"
                        : p.contentType === "remotion"
                          ? "וידאו (Remotion)"
                          : "תמונה";
                    const destLabel =
                      p.destination.platform === "instagram"
                        ? p.destination.placement === "story"
                          ? "Instagram — Story"
                          : p.destination.placement === "reels"
                            ? "Instagram — Reels"
                            : "Instagram — Post"
                        : p.destination.placement === "story"
                          ? "Facebook — Story"
                          : "Facebook — Post";

                    const status = p.status || "scheduled";
                    const badge =
                      status === "done"
                        ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/20"
                        : status === "publishing"
                          ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/20"
                          : status === "approved" || status === "pending_approval"
                            ? "bg-amber-500/15 text-amber-200 border-amber-400/20"
                            : status === "generating" || status === "waiting_asset"
                              ? "bg-violet-500/15 text-violet-200 border-violet-400/20"
                              : status === "error"
                                ? "bg-red-500/15 text-red-200 border-red-400/20"
                                : status === "cancelled"
                                  ? "bg-white/10 text-white/70 border-white/10"
                                  : "bg-white/5 text-white/70 border-white/10";
                    const statusLabel =
                      status === "scheduled"
                        ? "מתוזמן"
                        : status === "generating"
                          ? "בתהליך יצירה"
                          : status === "waiting_asset"
                            ? "ממתין לנכס"
                            : status === "pending_approval"
                              ? "ממתין לאישור"
                              : status === "approved"
                                ? "אושר — ממתין לפרסום"
                                : status === "publishing"
                                  ? "מעלה לרשת"
                                  : status === "done"
                                    ? "פורסם"
                                    : status === "error"
                                      ? "שגיאה"
                                      : status === "cancelled"
                                        ? "בוטל"
                                        : status;

                    const statusHelp =
                      status === "scheduled"
                        ? "Scheduled: waiting for generation start (lead time)."
                        : status === "generating"
                          ? "Generating: AI is creating the content."
                          : status === "waiting_asset"
                            ? "Waiting asset: render/video is still processing."
                            : status === "pending_approval"
                              ? "Pending approval: ready, waiting for your approval."
                              : status === "approved"
                                ? "Approved: ready, will publish at the scheduled time."
                                : status === "publishing"
                                  ? "Publishing: uploading to Meta (may take a few minutes)."
                                  : status === "done"
                                    ? "Published."
                                    : status === "cancelled"
                                      ? "Cancelled by you."
                                      : status === "error"
                                        ? "Error: open the generation to see details."
                                        : "Status";

                    const canCancel =
                      status === "scheduled" ||
                      status === "generating" ||
                      status === "waiting_asset" ||
                      status === "pending_approval" ||
                      status === "approved";

                    const canView = !!p.generationId;

                    return (
                      <tr
                        key={p.id}
                        className={[
                          "border-t border-white/10",
                          canView ? "cursor-pointer hover:bg-white/[0.03]" : "",
                        ].join(" ")}
                        onClick={() => {
                          if (!canView) return;
                          router.push(`/g/${p.generationId}`);
                        }}
                      >
                        <td className="py-3 pr-3 font-mono">{t}</td>
                        <td className="py-3 pr-3">{typeLabel}</td>
                        <td className="py-3 pr-3 text-white/80 hidden sm:table-cell">{destLabel}</td>
                        <td className="py-3 pr-3">
                          <div
                            className={`inline-flex items-center rounded-full border px-2 py-1 text-xs ${badge}`}
                            title={statusHelp}
                          >
                            {statusLabel}
                          </div>
                          {status === "generating" || status === "publishing" ? (
                            <div className="mt-1 text-[11px] text-white/55">
                              Content is being processed — cannot be modified.
                            </div>
                          ) : null}
                          {status === "error" && p.errorMessage ? (
                            <div className="mt-1 text-[11px] text-red-200/80">{p.errorMessage}</div>
                          ) : null}
                        </td>
                        <td className="py-3 pr-0 text-right">
                          <button
                            type="button"
                            className="bb-btn bb-btn-secondary mr-2"
                            disabled={!canView}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!p.generationId) return;
                              router.push(`/g/${p.generationId}`);
                            }}
                            title={p.generationId ? "פתח תוצאה" : "עדיין אין תוצאה"}
                          >
                            צפה
                          </button>
                          <button
                            type="button"
                            className="bb-btn bb-btn-secondary"
                            disabled={!canCancel || todayBusyId === p.id || !user}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!user) return;
                              setTodayBusyId(p.id);
                              try {
                                const token = await user.getIdToken();
                                const res = await fetch("/api/scheduled-posts/cancel", {
                                  method: "POST",
                                  headers: {
                                    "content-type": "application/json",
                                    ...(token ? { authorization: `Bearer ${token}` } : {}),
                                  },
                                  body: JSON.stringify({ id: p.id }),
                                });
                                const data = (await res.json().catch(() => null)) as any;
                                if (!res.ok) throw new Error(String(data?.error || "שגיאה"));
                              } catch (e) {
                                setTodayError(e instanceof Error ? e.message : "שגיאה");
                              } finally {
                                setTodayBusyId("");
                              }
                            }}
                          >
                            {todayBusyId === p.id ? "מבצע..." : "ביטול"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {todayPosts.length ? (
              <div className="mt-3 text-[11px] text-white/55 leading-5">
                הסבר סטטוסים: <span className="font-mono">scheduled</span> = מחכה להתחלת יצירה (Lead Time),{" "}
                <span className="font-mono">generating</span> = AI מייצר, <span className="font-mono">pending_approval</span> = מוכן ומחכה לאישור,{" "}
                <span className="font-mono">approved</span> = מוכן ויתפרסם בשעה, <span className="font-mono">publishing</span> = מעלה למטא.
              </div>
            ) : null}
          </div>
        </section>

        {isAdmin ? (
          <div className="space-y-4">
            <div className="bb-card p-4 border border-cyan-400/20 bg-cyan-400/5">
              <div className="text-sm font-semibold">מצב אדמין פעיל</div>
              <div className="mt-1 text-xs text-white/60">
                החשבון הזה מזוהה כאדמין. הנתון נשמר גם ב‑Firestore תחת{" "}
                <span className="font-mono">admins/&#123;uid&#125;</span>.
              </div>
            </div>
            <AdminUsersPanel />
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="bb-btn bb-btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "שומר..." : "שמור הגדרות"}
          </button>
          {saved ? <span className="text-sm text-emerald-400">נשמר ✓</span> : null}
        </div>
      </div>
    </AppShell>
  );
}
