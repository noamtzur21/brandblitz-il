import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

const PARTICLE_COUNT = 28;
const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  id: i,
  x: (i * 7 + 13) % 100,
  y: (i * 11 + 31) % 100,
  size: 2 + (i % 4),
  drift: 0.3 + (i % 5) * 0.1,
  phase: (i / PARTICLE_COUNT) * Math.PI * 2,
}));

/**
 * Particles – חלקיקי אור/אבק שצפים, נותנים עומק.
 */
export const ParticlesOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "plus-lighter",
      }}
    >
      {particles.map((p) => {
        const float = Math.sin((frame / 30) * p.drift + p.phase) * 2;
        const opacity = interpolate(
          (frame * 0.7 + p.phase * 10) % durationInFrames,
          [0, durationInFrames * 0.3],
          [0.15, 0.4],
          { extrapolateRight: "clamp", extrapolateLeft: "clamp" },
        );
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.85)",
              boxShadow: `0 0 ${p.size * 3}px rgba(255,255,255,0.6)`,
              transform: `translate(${float}px, ${float * 0.6}px)`,
              opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
