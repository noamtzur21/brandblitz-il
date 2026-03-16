import Link from "next/link";
import { AutoPlayVideo } from "@/components/AutoPlayVideo";
import { NANO_BANANA_4_SVG, REMOTION_SVG, VEO_3_1_SVG } from "@/lib/modelCards";

function BrandBlitzLogo({ size = "lg" }: { size?: "lg" | "md" }) {
  const isLg = size === "lg";
  return (
    <div className="flex items-center justify-center select-none">
      <div
        className={[
          "font-black tracking-tight drop-shadow-[0_10px_40px_rgba(0,0,0,0.5)]",
          isLg ? "text-4xl sm:text-6xl" : "text-2xl",
        ].join(" ")}
      >
        <span className="bg-gradient-to-l from-[color:var(--neon-cyan)] via-[color:var(--neon-purple)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
          BrandBlitz
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const svgToDataUri = (svg: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const techCards = [
    {
      name: "Nano Banana 4",
      icon: "🍌",
      img: svgToDataUri(NANO_BANANA_4_SVG),
    },
    {
      name: "Remotion",
      icon: "🎬",
      img: svgToDataUri(REMOTION_SVG),
    },
    {
      name: "Veo 3.1",
      icon: "📹",
      img: svgToDataUri(VEO_3_1_SVG),
    },
  ] as const;

  return (
    <div className="min-h-screen bb-bg">
      <div className="bb-container py-6 sm:py-8">
        <div className="bb-card bb-neon bb-frame-purple overflow-hidden">
          <div className="p-5 sm:p-8">
            <div className="flex flex-col gap-5">
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex gap-2">
                    <Link
                      href="/login?mode=signup"
                      className="bb-btn bb-btn-primary text-sm"
                    >
                      התחל
                    </Link>
                    <Link
                      href="/login?mode=login"
                      className="bb-btn bb-btn-secondary text-sm"
                    >
                      התחברות
                    </Link>
                  </div>
                  <div className="flex-1" />
                </div>

                <div className="mt-6 sm:mt-8">
                  <BrandBlitzLogo size="lg" />
                  <div className="mt-5 text-center">
                    <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                      תוכן ברמה גבוהה
                      <span className="bg-gradient-to-l from-[color:var(--neon-cyan)] to-[color:var(--neon-pink)] bg-clip-text text-transparent">
                        {" "}
                        בלי הגבלה
                      </span>
                    </h1>
                    <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-7 text-white/65">
                      מערכת שמייצרת עבורך תמונות וסרטונים ברמה גבוהה, מוכנים לרשתות, עם טקסט בעברית שנראה מצוין.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-2 grid gap-3 sm:grid-cols-3 justify-items-center">
                {techCards.map((t) => (
                  <div
                    key={t.name}
                    className={[
                      "bb-card bb-card-interactive bb-frame-purple bg-white/5 overflow-hidden w-full sm:max-w-[360px]",
                      "transition-all duration-200 hover:-translate-y-0.5",
                      "hover:shadow-[0_0_0_1px_rgba(124,92,255,0.22),0_0_70px_rgba(124,92,255,0.18)]",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.img}
                      alt={t.name}
                      className="h-44 w-full object-contain bg-black/25 opacity-95 transition duration-200 hover:opacity-100"
                      loading="lazy"
                    />
                    <div className="p-5">
                      <div className="text-sm font-semibold text-center">
                        <span className="inline-flex items-center justify-center gap-2">
                          <span aria-hidden>{t.icon}</span>
                          <span>{t.name}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-l from-[color:var(--neon-cyan)]/20 via-transparent to-[color:var(--neon-pink)]/20 pointer-events-none" />
            <AutoPlayVideo
              className="w-full aspect-[16/6] object-cover opacity-85"
              src="/hero/restaurant-4385.mp4"
              poster="/hero/restaurant-4385.jpg"
              preload="auto"
            />
          </div>
          <div className="h-1 w-full bg-gradient-to-l from-[color:var(--neon-cyan)] via-[color:var(--neon-purple)] to-[color:var(--neon-pink)]" />
        </div>
        <footer className="mt-6 text-xs text-white/55 flex flex-wrap items-center justify-center gap-4">
          <Link className="underline underline-offset-4 hover:text-white/80" href="/privacy">
            מדיניות פרטיות
          </Link>
          <Link className="underline underline-offset-4 hover:text-white/80" href="/data-deletion">
            מחיקת מידע
          </Link>
        </footer>
      </div>
    </div>
  );
}
