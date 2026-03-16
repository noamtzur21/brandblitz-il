"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, query, collection, where, orderBy, limit } from "firebase/firestore";
import Link from "next/link";
import { getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { useSession } from "@/app/providers";
import { AppShell } from "@/components/AppShell";
import { GenerationCard } from "@/components/GenerationCard";
import type { GenerationDoc } from "@/lib/types";
import { demoCreditsBalance, demoGenerations } from "@/lib/demo";

type CreditsDoc = { balance: number };

export default function DashboardPage() {
  const { user, userId, isReady, isDemo } = useSession();
  const canUseFirestore = !isDemo && isFirebaseClientConfigured();
  const [creditsLive, setCreditsLive] = useState<number | null>(null);
  const [gensLive, setGensLive] = useState<Array<GenerationDoc & { id: string }>>([]);
  const credits = !canUseFirestore ? demoCreditsBalance : creditsLive;
  const gens = !canUseFirestore ? demoGenerations : gensLive;

  useEffect(() => {
    if (!canUseFirestore || !user) return;
    const db = getClientDb();
    const creditsRef = doc(db, "users", user.uid, "credits", "summary");
    const unsub = onSnapshot(
      creditsRef,
      (snap) => {
        const data = snap.data() as CreditsDoc | undefined;
        setCreditsLive(typeof data?.balance === "number" ? data.balance : 0);
      },
      (err) => {
        // During sign-out / auth transitions Firestore can briefly emit permission-denied.
        if ((err as { code?: string } | null)?.code === "permission-denied") return;
        // eslint-disable-next-line no-console
        console.warn("[dashboard] credits listener error:", err);
      },
    );
    return () => unsub();
  }, [user, canUseFirestore]);

  useEffect(() => {
    if (!canUseFirestore || !user) return;
    const db = getClientDb();
    const q = query(
      collection(db, "generations"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(60),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: Array<GenerationDoc & { id: string }> = [];
        snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as GenerationDoc) }));
        setGensLive(rows);
      },
      (err) => {
        if ((err as { code?: string } | null)?.code === "permission-denied") return;
        // eslint-disable-next-line no-console
        console.warn("[dashboard] generations listener error:", err);
      },
    );
    return () => unsub();
  }, [user, canUseFirestore]);

  const headline = useMemo(() => {
    if (!isReady) return "טוען...";
    return "דשבורד";
  }, [isReady]);

  return (
    <AppShell
      title={headline}
      subtitle="הפיד שלך"
      right={
        <div className="flex items-center gap-2">
          {isDemo ? (
            <div className="bb-pill">
              <span className="bb-pill-dot" />
              <span className="text-xs font-semibold">דמו</span>
            </div>
          ) : null}
          <div className="bb-card px-4 py-2">
            <div className="text-[11px] text-white/60">יתרת קרדיטים</div>
            <div className="text-lg font-semibold leading-6">
              {credits === null ? "…" : credits}
            </div>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <section className="bb-card bb-neon p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <div className="text-sm font-semibold">ברוכים הבאים</div>
              <div className="mt-1 text-xs text-white/60">
                {userId ? (
                  <>
                    מזהה משתמש: <span className="font-mono">{userId}</span>
                  </>
                ) : (
                  "מתחבר..."
                )}
              </div>
            </div>

            <Link href="/generate" className="bb-btn bb-btn-primary shrink-0">
              צור חדש
            </Link>
          </div>
        </section>

        <section className="bb-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <div className="text-sm font-semibold">הפיד שלך</div>
              <div className="text-xs text-white/60">גריד בסגנון אינסטגרם</div>
            </div>
            <div className="text-xs text-white/60">{gens.length} פריטים</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {gens.map((g) => (
            <GenerationCard key={g.id} gen={g} />
          ))}
          {gens.length === 0 ? (
            <div className="bb-card col-span-2 p-6 text-sm text-white/70 sm:col-span-3 lg:col-span-4">
              <div className="text-base font-semibold">אין עדיין תוכן</div>
              <div className="mt-1 text-xs text-white/60">
                לחץ/י על “צור חדש” כדי להתחיל.
              </div>
              <div className="mt-4">
                <Link href="/generate" className="bb-btn bb-btn-primary">
                  יצירה חדשה
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

