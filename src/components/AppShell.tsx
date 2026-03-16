"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { useSession } from "@/app/providers";
import { getClientAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function TabIcon({
  name,
  active,
}: {
  name: "dashboard" | "generate";
  active: boolean;
}) {
  const stroke = active ? "rgba(233,238,252,0.95)" : "rgba(233,238,252,0.65)";
  const common = { stroke, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "dashboard") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path {...common} d="M4 4h7v9H4z" />
        <path {...common} d="M13 4h7v5h-7z" />
        <path {...common} d="M13 11h7v9h-7z" />
        <path {...common} d="M4 15h7v5H4z" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path {...common} d="M12 5v14" />
      <path {...common} d="M5 12h14" />
      <path {...common} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    </svg>
  );
}

function BrandBlitzWordmark() {
  const { user, isDemo } = useSession();
  const href = !isDemo && user ? "/dashboard" : "/";
  return (
    <Link href={href} className="select-none">
      <span className="text-lg font-semibold tracking-tight">
        <span className="bg-gradient-to-l from-[color:var(--neon-cyan)] via-[color:var(--neon-purple)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
          BrandBlitz
        </span>
      </span>
    </Link>
  );
}

export function AppShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isDemo } = useSession();
  const canAuth = !isDemo && isFirebaseClientConfigured();
  return (
    <div className="min-h-screen bb-bg">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[color:var(--background)]/75 backdrop-blur">
        <div className="bb-container py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3">
                <BrandBlitzWordmark />
                <span className="sr-only">{title}</span>
              </div>
              {subtitle ? (
                <div className="text-xs text-white/60">{subtitle}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {right}
              {canAuth ? (
                user ? (
                  user.isAnonymous ? (
                    <Link href="/login?mode=signup" className="bb-btn bb-btn-secondary text-sm">
                      הרשמה
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className="bb-btn bb-btn-secondary text-sm"
                      onClick={async () => {
                        await signOut(getClientAuth());
                        router.push("/");
                      }}
                    >
                      התנתק
                    </button>
                  )
                ) : (
                  <Link href="/login?mode=login" className="bb-btn bb-btn-secondary text-sm">
                    התחבר
                  </Link>
                )
              ) : null}
            </div>
          </div>

          <nav className="mt-4 hidden items-center gap-2 sm:flex">
            <NavLink href="/dashboard">דשבורד</NavLink>
            <NavLink href="/generate">יצירה חדשה</NavLink>
            <NavLink href="/settings">הגדרות משתמש</NavLink>
          </nav>
        </div>
      </header>

      <main className="bb-container py-6 pb-24 sm:pb-10">{children}</main>

      <footer className="bb-container pb-28 sm:pb-10 -mt-2 text-xs text-white/55 flex flex-wrap items-center justify-center gap-4">
        <Link className="underline underline-offset-4 hover:text-white/80" href="/privacy">
          מדיניות פרטיות
        </Link>
        <Link className="underline underline-offset-4 hover:text-white/80" href="/terms">
          תנאים
        </Link>
        <Link className="underline underline-offset-4 hover:text-white/80" href="/data-deletion">
          מחיקת מידע
        </Link>
      </footer>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[color:var(--background)]/80 backdrop-blur sm:hidden">
        <div className="bb-container py-2">
          <div className="grid grid-cols-3 gap-2">
            <Link
              href="/dashboard"
              className={[
                "bb-card bb-card-interactive flex items-center justify-center gap-2 px-2 py-3 transition active:scale-[0.98]",
                pathname === "/dashboard" ? "bb-card-selected" : "",
              ].join(" ")}
            >
              <TabIcon name="dashboard" active={pathname === "/dashboard"} />
              <span className="text-xs font-semibold sm:text-sm">דשבורד</span>
            </Link>
            <Link
              href="/generate"
              className={[
                "bb-card bb-card-interactive flex items-center justify-center gap-2 px-2 py-3 transition active:scale-[0.98]",
                pathname === "/generate" ? "bb-card-selected" : "",
              ].join(" ")}
            >
              <TabIcon name="generate" active={pathname === "/generate"} />
              <span className="text-xs font-semibold sm:text-sm">צור חדש</span>
            </Link>
            <Link
              href="/settings"
              className={[
                "bb-card bb-card-interactive flex items-center justify-center gap-2 px-2 py-3 transition active:scale-[0.98]",
                pathname === "/settings" ? "bb-card-selected" : "",
              ].join(" ")}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={pathname === "/settings" ? "rgba(233,238,252,0.95)" : "rgba(233,238,252,0.65)"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              <span className="text-xs font-semibold sm:text-sm">הגדרות</span>
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}

