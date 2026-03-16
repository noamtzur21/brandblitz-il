import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bb-bg">
          <div className="bb-container py-10">
            <div className="mx-auto max-w-md bb-card p-6 text-center text-white/70">טוען...</div>
          </div>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}

