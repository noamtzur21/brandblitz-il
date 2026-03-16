"use client";

import { useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/app/providers";
import type { BrandKitDoc } from "@/lib/types";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";

const DEFAULT_COLOR = "#00f5ff";

function parseHexColor(s: string): string {
  const t = s.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t}`;
  return DEFAULT_COLOR;
}

export default function SettingsPage() {
  const { user, isReady, isDemo } = useSession();
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
