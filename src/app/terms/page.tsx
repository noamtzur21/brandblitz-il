export const metadata = {
  title: "Terms of Service | BrandBlitz",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bb-bg">
      <div className="bb-container py-12">
        <div className="bb-card bb-neon p-6 sm:p-10">
          <h1 className="text-xl sm:text-2xl font-semibold">Terms of Service</h1>
          <p className="mt-2 text-sm text-white/70">
            These Terms govern your use of BrandBlitz. By using the service, you agree to these Terms.
          </p>

          <div className="mt-8 space-y-6 text-sm text-white/80 leading-7">
            <section>
              <div className="text-sm font-semibold">Service</div>
              <p className="mt-2 text-white/75">
                BrandBlitz helps users create marketing assets (images/videos) and publish them to social platforms when connected.
                Features may change over time.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">User content</div>
              <p className="mt-2 text-white/75">
                You are responsible for the content you generate, upload, or publish. Do not use the service for illegal, harmful,
                or infringing content.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Publishing to Meta</div>
              <p className="mt-2 text-white/75">
                When you connect Facebook/Instagram, you authorize BrandBlitz to publish content on your behalf. You can disconnect at any time
                from the Settings page.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Availability</div>
              <p className="mt-2 text-white/75">
                The service is provided “as is” and may experience downtime. We do not guarantee uninterrupted availability.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">Contact</div>
              <p className="mt-2 text-white/75">For questions about these Terms, contact the site owner.</p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

