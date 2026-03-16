import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Light leaks – הבזקי אור צבעוניים שנעים בעדינות בפינות.
 * Pure CSS radial gradients, animated by frame.
 */
export const LightLeaksOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const t = frame / durationInFrames;
  const move1 = Math.sin(t * Math.PI * 2) * 0.1 + 0.5;
  const move2 = Math.cos(t * Math.PI * 1.5) * 0.1 + 0.5;
  const opacity = 0.12 + 0.04 * Math.sin(frame * 0.05);

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-10%",
          width: "60%",
          height: "60%",
          background: `radial-gradient(circle at ${move1 * 100}% ${move2 * 100}%, rgba(255,180,100,0.4) 0%, transparent 60%)`,
          opacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          right: "-10%",
          width: "55%",
          height: "55%",
          background: `radial-gradient(circle at ${(1 - move2) * 100}% ${(1 - move1) * 100}%, rgba(100,180,255,0.35) 0%, transparent 55%)`,
          opacity: opacity * 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "30%",
          right: "-15%",
          width: "50%",
          height: "40%",
          background: `radial-gradient(circle at ${move2 * 100}% 50%, rgba(255,100,180,0.25) 0%, transparent 50%)`,
          opacity: opacity * 0.8,
        }}
      />
    </AbsoluteFill>
  );
};
