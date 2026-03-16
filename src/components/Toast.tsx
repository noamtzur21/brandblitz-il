"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
};

type ToastCtx = {
  push: (t: Omit<ToastItem, "id">) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item: ToastItem = { id, ...t };
    setItems((prev) => [item, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 2400);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed left-0 right-0 top-3 z-[60] px-3 sm:left-auto sm:right-4 sm:top-4 sm:w-[360px]">
        <div className="grid gap-2">
          {items.map((t) => (
            <div key={t.id} className="bb-card bb-neon p-3">
              <div className="flex items-start gap-2">
                <span
                  className={[
                    "mt-1 inline-block h-2 w-2 rounded-full",
                    t.type === "success"
                      ? "bg-[color:var(--neon-cyan)]"
                      : t.type === "error"
                        ? "bg-red-400"
                        : "bg-[color:var(--neon-pink)]",
                  ].join(" ")}
                />
                <div className="flex flex-col">
                  <div className="text-sm font-semibold">{t.title}</div>
                  {t.description ? (
                    <div className="mt-0.5 text-xs text-white/60">
                      {t.description}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

