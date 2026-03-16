"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";

type Plan = {
  id: "starter" | "pro" | "business";
  title: string;
  price: string;
  bullets: string[];
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    title: "Starter",
    price: "חינם",
    bullets: ["20 קרדיטים התחלתיים", "תמונה + Remotion", "Brand Kit בסיסי", "תמיכה בסיסית"],
    cta: "התחל עכשיו",
  },
  {
    id: "pro",
    title: "Pro",
    price: "₪99 / חודש",
    bullets: ["400 קרדיטים בחודש", "Premium (Veo/Kling)", "עדיפות בתור", "Export מהיר + הורדה"],
    cta: "שדרג ל‑Pro",
    highlight: true,
  },
  {
    id: "business",
    title: "Business",
    price: "₪249 / חודש",
    bullets: ["1500 קרדיטים בחודש", "Premium ללא הגבלה מעשית", "ניהול צוות (בקרוב)", "תמיכה מהירה"],
    cta: "דברו איתנו",
  },
];

export default function PlansPage() {
  return (
    <AppShell title="חבילות" subtitle="Paywall (UI) – חיוב אמיתי בהמשך">
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <section
            key={p.id}
            className={[
              "bb-card p-5",
              p.highlight ? "bb-neon border border-cyan-400/30" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <div className="text-lg font-semibold">{p.title}</div>
                <div className="mt-1 text-sm text-white/70">{p.price}</div>
              </div>
              {p.highlight ? (
                <div className="bb-pill">
                  <span className="bb-pill-dot" />
                  <span className="text-xs font-semibold">מומלץ</span>
                </div>
              ) : null}
            </div>

            <ul className="mt-4 space-y-2 text-sm text-white/75">
              {p.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-cyan-300">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <Link href="/generate" className={["bb-btn w-full", p.highlight ? "bb-btn-primary" : "bb-btn-secondary"].join(" ")}>
                {p.cta}
              </Link>
            </div>

            <div className="mt-3 text-xs text-white/50">
              זה מסך UI. חיוב (Stripe) + חידוש חודשי של קרדיטים יגיעו בהמשך.
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

