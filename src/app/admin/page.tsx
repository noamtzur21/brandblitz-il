"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useSession } from "@/app/providers";
import { isFirebaseClientConfigured } from "@/lib/firebase/client";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";

export default function AdminPage() {
  const { user, isReady, isDemo } = useSession();
  const firebaseOk = isFirebaseClientConfigured() && !isDemo;

  const [error, setError] = useState<string | null>(null);
  const [vertexSmoke, setVertexSmoke] = useState<{
    imageUrl: string;
    overlayText: string;
    caption: string;
  } | null>(null);

  const headline = useMemo(() => {
    if (!isReady) return "טוען...";
    return "ניהול";
  }, [isReady]);

  async function runVertexSmoke() {
    if (!firebaseOk) return;
    if (!user) return;
    setError(null);
    setVertexSmoke(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/vertex/smoke", {
        method: "POST",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; imageUrl: string; overlayText: string; caption: string }
        | { error?: string }
        | null;
      if (!res.ok) throw new Error((data as any)?.error ?? `Request failed (${res.status})`);
      if ((data as any)?.ok && (data as any)?.imageUrl) {
        setVertexSmoke({
          imageUrl: (data as any).imageUrl,
          overlayText: (data as any).overlayText ?? "",
          caption: (data as any).caption ?? "",
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "בדיקת Vertex נכשלה");
    }
  }

  return (
    <AppShell
      title={headline}
      subtitle="רק למשתמשי Admin (ניהול קרדיטים)"
    >
      {!firebaseOk ? (
        <div className="bb-card p-5 text-sm text-white/70">
          Firebase לא מוגדר (או מצב דמו). אין גישה לניהול.
        </div>
      ) : !user ? (
        <div className="bb-card p-5 text-sm text-white/70">מתחבר…</div>
      ) : (
        <div className="grid gap-3">
          {error ? <div className="text-sm text-red-300">{error}</div> : null}

          <section className="bb-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <div className="text-sm font-semibold">סטטוס התחברות</div>
                <div className="mt-1 text-xs text-white/60">
                  UID: <span className="font-mono">{user.uid}</span>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  אימייל:{" "}
                  <span className="font-mono">
                    {user.email ?? "לא קיים"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-white/60">
                  סוג:{" "}
                  <span className="font-semibold">
                    {user.isAnonymous ? "Anonymous (לא אדמין)" : "Authenticated"}
                  </span>
                </div>
              </div>
              {user.isAnonymous ? (
                <a href="/login" className="bb-btn bb-btn-primary text-sm">
                  התחבר כאדמין
                </a>
              ) : null}
            </div>
            <div className="mt-3 text-xs text-white/55">
              אם אתה רואה כאן Anonymous או שהאימייל לא נכון, השרת יחזיר <span className="font-mono">403 Forbidden</span>.
              כדי לקבל גישה, התחבר עם האימייל שמוגדר ב־<span className="font-mono">ADMIN_EMAILS</span> או הוסף את ה־UID שלך ל־<span className="font-mono">ADMIN_UIDS</span>.
            </div>
          </section>

          <section className="bb-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <div className="text-sm font-semibold">בדיקת Vertex (Imagen)</div>
                <div className="text-xs text-white/60">מייצר תמונה אחת ושומר ל‑R2</div>
              </div>
              <button
                type="button"
                className="bb-btn bb-btn-secondary text-sm"
                disabled={false}
                onClick={runVertexSmoke}
              >
                הרץ בדיקה
              </button>
            </div>
            {vertexSmoke ? (
              <div className="mt-3 grid gap-2">
                <div className="text-xs text-white/60">Overlay</div>
                <div className="text-sm whitespace-pre-line">{vertexSmoke.overlayText}</div>
                <div className="text-xs text-white/60">תוצאה</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vertexSmoke.imageUrl}
                  alt="Vertex smoke result"
                  className="w-full max-w-sm rounded-xl border border-white/10"
                />
              </div>
            ) : null}
          </section>

          <AdminUsersPanel />
        </div>
      )}
    </AppShell>
  );
}

