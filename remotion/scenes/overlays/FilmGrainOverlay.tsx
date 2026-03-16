import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

/**
 * Film grain – טקסטורת פילם עדינה (SVG feTurbulence).
 * מוריד את ה"דיגיטלי" ונותן תחושה קולנועית.
 */
export const FilmGrainOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame % 20, [0, 20], [0.05, 0.09], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "overlay",
      }}
    >
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="grain-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="3"
              seed={Math.floor(frame / 5) % 20}
              result="noise"
            />
            <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
            <feBlend in="SourceGraphic" in2="mono" mode="overlay" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="white" filter="url(#grain-filter)" opacity={opacity} />
      </svg>
    </AbsoluteFill>
  );
};
