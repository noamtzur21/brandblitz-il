export const metadata = {
  title: "Data Deletion | BrandBlitz",
};

export default function DataDeletionPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const code = searchParams?.code ? String(searchParams.code) : "";
  return (
    <main className="min-h-screen bb-bg">
      <div className="bb-container py-12">
        <div className="bb-card bb-neon p-6 sm:p-10">
          <h1 className="text-xl sm:text-2xl font-semibold">Data Deletion Instructions</h1>
          <p className="mt-2 text-sm text-white/70">
            This page is provided for Meta / GDPR requirements and explains how to disconnect and request data deletion.
          </p>

          <div className="mt-8 space-y-6 text-sm text-white/80 leading-7">
            <section>
              <div className="text-sm font-semibold">Disconnect Facebook/Instagram (Meta)</div>
              <ol className="mt-2 list-decimal pl-5 space-y-1 text-white/75">
                <li>Go to the “User Settings” page in the app.</li>
                <li>Under “Instagram / Facebook connection”, click “Disconnect”.</li>
                <li>Optional: in your Facebook/Instagram settings, remove the app from the list of connected apps.</li>
              </ol>
            </section>

            <section>
              <div className="text-sm font-semibold">Request deletion</div>
              <p className="mt-2 text-white/75">
                To request full deletion (including generated assets, files, and settings), please contact the site owner.
                Include the email address associated with your account.
              </p>
              <p className="mt-2 text-white/75">
                After verifying ownership, we will delete the relevant data from our systems within a reasonable timeframe.
              </p>
              {code ? (
                <p className="mt-3 text-xs text-white/60">
                  Confirmation code: <span className="font-mono text-white/80">{code}</span>
                </p>
              ) : null}
            </section>

            <section>
              <div className="text-sm font-semibold">What will be deleted</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-white/75">
                <li>Meta connections (tokens and identifiers).</li>
                <li>User settings (business logo / brand color).</li>
                <li>Generations and outputs (images/videos) and related file links.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

