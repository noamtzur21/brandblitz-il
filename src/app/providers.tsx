"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getClientAuth, getClientDb, isFirebaseClientConfigured } from "@/lib/firebase/client";
import { ToastProvider } from "@/components/Toast";

const INITIAL_CREDITS = 20;

type AppSession = {
  user: User | null;
  userId: string | null;
  isReady: boolean;
  isDemo: boolean;
};

const SessionContext = createContext<AppSession | null>(null);

async function ensureCreditsDoc(uid: string) {
  const db = getClientDb();
  const creditsRef = doc(db, "users", uid, "credits", "summary");
  const snap = await getDoc(creditsRef);
  if (snap.exists()) return;
  await setDoc(creditsRef, { balance: INITIAL_CREDITS, updatedAt: Date.now() });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      setIsDemo(true);
      setUser(null);
      setUserId("demo-user");
      setIsReady(true);
      return;
    }

    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          const cred = await signInAnonymously(auth);
          setUser(cred.user);
          setUserId(cred.user.uid);
          await ensureCreditsDoc(cred.user.uid);
        } else {
          setUser(u);
          setUserId(u.uid);
          await ensureCreditsDoc(u.uid);
        }
      } finally {
        setIsReady(true);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({ user, userId, isReady, isDemo }),
    [user, userId, isReady, isDemo],
  );

  return (
    <SessionContext.Provider value={value}>
      <ToastProvider>{children}</ToastProvider>
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within Providers");
  return ctx;
}

