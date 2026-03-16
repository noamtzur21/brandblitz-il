"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/app/providers";
import { isFirebaseClientConfigured } from "@/lib/firebase/client";

type AdminUserRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  disabled: boolean;
  providerIds: string[];
  credits: number;
};

export function AdminUsersPanel() {
  const { user, isReady, isDemo } = useSession();
  const firebaseOk = isFirebaseClientConfigured() && !isDemo;

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditDeltaByUid, setCreditDeltaByUid] = useState<Record<string, string>>({});

  async function loadUsers() {
    if (!firebaseOk || !user) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const url = new URL("/api/admin/users", window.location.origin);
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json().catch(() => null)) as
        | { users: AdminUserRow[]; nextPageToken: string | null }
        | { error: string }
        | null;
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
      setRows((data as { users: AdminUserRow[] }).users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת משתמשים");
    } finally {
      setBusy(false);
    }
  }

  async function applyCredits(uid: string) {
    if (!firebaseOk || !user) return;
    const raw = (creditDeltaByUid[uid] ?? "").trim();
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) {
      setError("הכנס מספר (חיובי או שלילי) לשינוי קרדיטים.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ uid, delta }),
      });
      const data = (await res.json().catch(() => null)) as { balance?: number; error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
      const balance = typeof data?.balance === "number" ? data.balance : null;
      if (balance != null) {
        setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, credits: balance } : r)));
      }
      setCreditDeltaByUid((prev) => ({ ...prev, [uid]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בעדכון קרדיטים");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isReady) return;
    if (!firebaseOk) return;
    if (!user) return;
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, firebaseOk, user?.uid]);

  return (
    <section className="bb-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <div className="text-sm font-semibold">ניהול משתמשים (Admin)</div>
          <div className="mt-1 text-xs text-white/60">
            כאן אפשר לראות את כל המשתמשים ולעדכן להם קרדיטים. הפעולות נרשמות ב‑Firestore תחת{" "}
            <span className="font-mono">users/&#123;uid&#125;/credits/summary</span>.
          </div>
        </div>
        <button type="button" className="bb-btn bb-btn-secondary text-sm" disabled={busy || !user} onClick={loadUsers}>
          {busy ? "טוען..." : "רענן"}
        </button>
      </div>

      {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}

      {!firebaseOk ? (
        <div className="mt-4 text-sm text-white/70">Firebase לא מוגדר (או מצב דמו). אין גישה לניהול.</div>
      ) : !user ? (
        <div className="mt-4 text-sm text-white/70">מתחבר…</div>
      ) : (
        <div className="mt-4 overflow-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="text-right p-3 font-semibold">אימייל</th>
                <th className="text-right p-3 font-semibold">שם</th>
                <th className="text-right p-3 font-semibold">UID</th>
                <th className="text-right p-3 font-semibold">Providers</th>
                <th className="text-right p-3 font-semibold">קרדיטים</th>
                <th className="text-right p-3 font-semibold">שינוי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.uid} className="border-t border-white/10">
                  <td className="p-3">{r.email ?? <span className="text-white/50">לא קיים</span>}</td>
                  <td className="p-3">{r.displayName ?? <span className="text-white/50">לא קיים</span>}</td>
                  <td className="p-3 font-mono text-xs">{r.uid}</td>
                  <td className="p-3 text-xs text-white/70">
                    {r.providerIds?.length ? r.providerIds.join(", ") : "לא קיים"}
                    {r.disabled ? <span className="ml-2 text-red-300">disabled</span> : null}
                  </td>
                  <td className="p-3 font-semibold">{r.credits}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="bb-card bb-input w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-sm font-mono"
                        placeholder="+10 / -10"
                        value={creditDeltaByUid[r.uid] ?? ""}
                        onChange={(e) => setCreditDeltaByUid((prev) => ({ ...prev, [r.uid]: e.target.value }))}
                        inputMode="numeric"
                      />
                      <button
                        type="button"
                        className="bb-btn bb-btn-primary text-sm"
                        disabled={busy}
                        onClick={() => applyCredits(r.uid)}
                      >
                        החל
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="p-4 text-white/60" colSpan={6}>
                    אין משתמשים להצגה (או שאין הרשאות אדמין).
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

