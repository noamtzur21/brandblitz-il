"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  linkWithCredential,
  linkWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { useSession } from "@/app/providers";
import { getClientAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

function BrandBlitzMark() {
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="text-2xl font-semibold tracking-tight">
        <span className="bg-gradient-to-l from-[color:var(--neon-cyan)] via-[color:var(--neon-purple)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
          BrandBlitz
        </span>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.03 1.53 7.41 2.81l5.4-5.4C33.63 3.94 29.25 2 24 2 14.73 2 6.86 7.29 3.09 15.01l6.31 4.9C11.03 13.3 16.98 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46 24.5c0-1.57-.14-2.77-.45-4.02H24v7.63h12.53c-.25 2-1.6 5.01-4.62 7.03l7.1 5.5C43.9 34.08 46 29.68 46 24.5z"
      />
      <path
        fill="#FBBC05"
        d="M9.4 28.09c-.39-1.17-.62-2.42-.62-3.69s.23-2.52.6-3.69l-6.31-4.9C1.74 18.53 1 21.2 1 24.4c0 3.19.74 5.87 2.07 8.58l6.33-4.89z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.25 0 9.63-1.73 12.84-4.71l-7.1-5.5c-1.9 1.33-4.45 2.26-5.74 2.26-7.02 0-12.97-3.8-14.6-9.41l-6.33 4.89C6.85 41.71 14.73 46 24 46z"
      />
      <path fill="none" d="M1 1h46v46H1z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M4.5 7.5A2.5 2.5 0 0 1 7 5h10a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 17 19H7a2.5 2.5 0 0 1-2.5-2.5v-9z"
        stroke="rgba(233,238,252,0.9)"
        strokeWidth="2"
      />
      <path
        d="M6.5 8l5.5 4 5.5-4"
        stroke="rgba(0,245,255,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M7 11V8.8A5 5 0 0 1 12 4a5 5 0 0 1 5 4.8V11"
        stroke="rgba(233,238,252,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.5 11h9A2.5 2.5 0 0 1 19 13.5v4A2.5 2.5 0 0 1 16.5 20h-9A2.5 2.5 0 0 1 5 17.5v-4A2.5 2.5 0 0 1 7.5 11z"
        stroke="rgba(255,64,181,0.9)"
        strokeWidth="2"
      />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
        stroke="rgba(233,238,252,0.9)"
        strokeWidth="2"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        stroke="rgba(0,245,255,0.9)"
        strokeWidth="2"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
      <path
        d="M3 3l18 18"
        stroke="rgba(233,238,252,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 12s3.5-7 9.5-7c2.02 0 3.83.55 5.35 1.38M21.5 12s-3.5 7-9.5 7c-2.02 0-3.83-.55-5.35-1.38"
        stroke="rgba(255,64,181,0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LoginClient() {
  const { user, isDemo } = useSession();
  const router = useRouter();
  const sp = useSearchParams();

  const mode = (sp.get("mode") === "login" ? "login" : "signup") as "login" | "signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firebaseOk = isFirebaseClientConfigured() && !isDemo;

  const headline = useMemo(() => {
    if (!firebaseOk) return "התחברות (דמו)";
    return mode === "signup" ? "הרשמה" : "התחברות";
  }, [firebaseOk, mode]);

  const sub = useMemo(() => {
    if (!firebaseOk) return "Firebase לא מוגדר. זה מסך דמו.";
    return mode === "signup" ? "פתח/י חשבון והתחל/י לייצר תוכן" : "התחבר/י כדי להמשיך";
  }, [firebaseOk, mode]);

  async function handleGoogle() {
    if (!firebaseOk) return;
    setBusy(true);
    setError(null);
    try {
      const auth = getClientAuth();
      const provider = new GoogleAuthProvider();
      const wasAnon = !!auth.currentUser?.isAnonymous;
      const cred =
        mode === "signup" && wasAnon
          ? await linkWithPopup(auth.currentUser, provider)
          : await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(cred);
      const isNew = !!info?.isNewUser;
      if (mode === "login" && isNew) {
        await auth.signOut();
        setError("החשבון לא קיים במערכת. עבור/י להרשמה.");
        return;
      }
      if (mode === "signup" && !wasAnon && !isNew) {
        await auth.signOut();
        setError("כבר קיים חשבון עם Google הזה. עבור/י להתחברות.");
        return;
      }
      router.push("/dashboard");
    } catch (e) {
      const err = e as unknown;
      const code =
        err instanceof FirebaseError ? err.code : (err as { code?: string } | null)?.code;
      if (code === "auth/operation-not-allowed") {
        setError(
          "התחברות עם Google לא מופעלת בפרויקט Firebase. הפעל ב‑Firebase Console: Authentication → Sign-in method → Google → Enable.",
        );
      } else if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        setError("כבר קיים חשבון עם Google הזה. עבור/י להתחברות.");
      } else if (code === "auth/popup-closed-by-user") {
        setError("החלון נסגר לפני סיום ההתחברות.");
      } else if (code === "auth/cancelled-popup-request") {
        setError("בקשת התחברות בוטלה. נסה שוב.");
      } else if (code === "auth/popup-blocked") {
        setError("הדפדפן חסם את חלון ההתחברות. אפשר Popups לאתר ונסה שוב.");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה בהתחברות עם Google");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmail() {
    if (!firebaseOk) return;
    const e = normalizeEmail(email);
    if (!e || !password) {
      setError("חסר אימייל או סיסמה");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = getClientAuth();
      if (mode === "signup") {
        if (auth.currentUser?.isAnonymous) {
          const cred = EmailAuthProvider.credential(e, password);
          await linkWithCredential(auth.currentUser, cred);
        } else {
          await createUserWithEmailAndPassword(auth, e, password);
        }
      } else {
        const res = await signInWithEmailAndPassword(auth, e, password);
        // If this is a brand-new account created by provider, block login mode.
        const info = getAdditionalUserInfo(res as unknown as Parameters<typeof getAdditionalUserInfo>[0]);
        const isNew = !!info?.isNewUser;
        if (isNew) {
          await auth.signOut();
          setError("החשבון לא קיים במערכת. עבור/י להרשמה.");
          return;
        }
      }
      router.push("/dashboard");
    } catch (e) {
      const err = e as unknown;
      const code =
        err instanceof FirebaseError ? err.code : (err as { code?: string } | null)?.code;
      if (code === "auth/operation-not-allowed") {
        setError(
          "התחברות עם אימייל וסיסמה לא מופעלת בפרויקט Firebase. הפעל ב‑Firebase Console: Authentication → Sign-in method → Email/Password → Enable.",
        );
      } else if (code === "auth/user-not-found") {
        setError("החשבון לא קיים במערכת. עבור/י להרשמה.");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("סיסמה שגויה. נסה שוב.");
      } else if (code === "auth/email-already-in-use") {
        setError("כבר קיים חשבון עם האימייל הזה. עבור/י להתחברות.");
      } else if (code === "auth/weak-password") {
        setError("הסיסמה חלשה מדי. נסה סיסמה ארוכה יותר.");
      } else if (code === "auth/invalid-email") {
        setError("אימייל לא תקין.");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bb-bg">
      <div className="bb-container py-10">
        <div className="mx-auto max-w-md bb-card bb-neon overflow-hidden">
          <div className="p-7 sm:p-10">
            <div className="flex flex-col gap-7">
              <div className="flex flex-col items-center gap-3">
                <BrandBlitzMark />
                <div className="text-xl font-semibold">{headline}</div>
                <div className="text-sm text-white/60 text-center">{sub}</div>
              </div>

              {firebaseOk ? (
                <button
                  type="button"
                  className="bb-btn bb-btn-primary w-full min-h-[48px] flex items-center justify-center gap-2"
                  onClick={handleGoogle}
                  disabled={busy}
                >
                  <GoogleIcon />
                  {mode === "signup" ? "הרשמה עם Google" : "התחברות עם Google"}
                </button>
              ) : null}

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs text-white/50">או</div>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1">
                  <div className="text-xs text-white/60">אימייל</div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-90">
                      <MailIcon />
                    </div>
                    <input
                      className="bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-3 py-3 text-sm outline-none"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@email.com"
                      dir="ltr"
                      inputMode="email"
                      autoComplete="email"
                    />
                  </div>
                </label>

                <label className="grid gap-1">
                  <div className="text-xs text-white/60">סיסמה</div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-90">
                      <LockIcon />
                    </div>
                    <input
                      className="bb-card bb-input w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-10 py-3 text-sm outline-none"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 opacity-90 hover:opacity-100 z-10"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </label>

                {error ? <div className="text-sm text-red-300">{error}</div> : null}

                <button
                  type="button"
                  className="bb-btn bb-btn-secondary w-full min-h-[48px]"
                  onClick={handleEmail}
                  disabled={busy}
                >
                  {busy ? "טוען..." : mode === "signup" ? "הרשמה" : "התחברות"}
                </button>
              </div>

              <div className="text-xs text-white/60 text-center">
                {mode === "signup" ? (
                  <>
                    כבר יש לך חשבון?{" "}
                    <Link href="/login?mode=login" className="text-white underline underline-offset-4">
                      התחבר
                    </Link>
                  </>
                ) : (
                  <>
                    אין לך חשבון?{" "}
                    <Link href="/login?mode=signup" className="text-white underline underline-offset-4">
                      הרשמה
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="h-1 w-full bg-gradient-to-l from-[color:var(--neon-cyan)] via-[color:var(--neon-purple)] to-[color:var(--neon-pink)]" />
        </div>
      </div>
    </div>
  );
}

