export const metadata = {
  title: "Privacy Policy | BrandBlitz",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bb-bg">
      <div className="bb-container py-12">
        <div className="bb-card bb-neon p-6 sm:p-10">
          <h1 className="text-xl sm:text-2xl font-semibold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-white/70">
            This page explains what data we collect, why we collect it, and how you can request deletion.
          </p>

          <div className="mt-8 space-y-6 text-sm text-white/80 leading-7">
            <section>
              <div className="text-sm font-semibold">What we collect</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-white/75">
                <li>Account info: email (if you sign up / log in) and an internal user ID (UID).</li>
                <li>Generated content: your prompts/requests, generated captions/hashtags, and resulting assets (image/video) URLs.</li>
                <li>Settings: business logo and brand color (if provided).</li>
                <li>Meta connection (Facebook/Instagram): tokens and selected Page/IG identifiers (stored server-side only).</li>
              </ul>
            </section>

            <section>
              <div className="text-sm font-semibold">Why we need it</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-white/75">
                <li>To authenticate users and store credits and history.</li>
                <li>To generate and store your assets (images/videos).</li>
                <li>To publish on your behalf to Facebook/Instagram when you use “Quick Post”.</li>
              </ul>
            </section>

            <section>
              <div className="text-sm font-semibold">Sharing</div>
              <p className="mt-2 text-white/75">
                We do not sell personal data. To provide the product, we use third‑party services (for example: Meta for publishing,
                cloud storage providers for hosting files, and AI providers for generation).
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Security</div>
              <p className="mt-2 text-white/75">
                Meta tokens are stored server-side only and protected by Firestore security rules so the client cannot read or write them directly.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Data deletion</div>
              <p className="mt-2 text-white/75">
                You can request deletion by following the instructions on{" "}
                <a className="underline underline-offset-4" href="/data-deletion">
                  Data Deletion
                </a>
                .
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Contact</div>
              <p className="mt-2 text-white/75">
                If you have questions about privacy or want to request deletion, contact the site owner.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

