"use client";

import { useEffect, useRef, useState } from "react";

export function AutoPlayVideo({
  src,
  className,
  poster,
  loop = true,
  preload = "auto",
}: {
  src: string;
  className?: string;
  poster?: string;
  loop?: boolean;
  preload?: "auto" | "metadata" | "none";
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Best-effort: start early so it's already playing when user reaches it.
    const tryPlay = async () => {
      try {
        el.muted = true;
        el.playsInline = true;
        await el.play();
      } catch {
        // Ignore autoplay restrictions / timing.
      }
    };

    // Try immediately (helps above-the-fold).
    void tryPlay();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          void tryPlay();
        }
      },
      { root: null, rootMargin: "1200px 0px 1200px 0px", threshold: 0.01 },
    );

    io.observe(el);

    const onLoaded = () => void tryPlay();
    el.addEventListener("loadeddata", onLoaded);
    return () => {
      el.removeEventListener("loadeddata", onLoaded);
      io.disconnect();
    };
  }, []);

  if (errored) {
    // If video fails (codec/CORS), show poster so we never display "dead" tiles.
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        className={className}
        src={poster || "/model-cards/remotion.svg"}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <video
      ref={ref}
      className={className}
      src={src}
      autoPlay
      muted
      loop={loop}
      playsInline
      preload={preload}
      poster={poster}
      onError={() => setErrored(true)}
    />
  );
}

