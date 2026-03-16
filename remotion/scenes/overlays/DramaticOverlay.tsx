import React from "react";
import { AbsoluteFill } from "remotion";

/**
 * Dramatic overlay – ויגנט חזק + טשטוש קל בקצוות (gradient mask).
 * משמש לסגנון "dramatic" או כשכבה כללית.
 */
export const DramaticOverlay: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const v = 0.5 + 0.4 * intensity;
  const blurWidth = 15 + 10 * intensity;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: `
          radial-gradient(ellipse 70% 60% at 50% 40%, transparent 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,${v}) 100%),
          radial-gradient(ellipse 100% 100% at 50% 50%, transparent 50%, transparent ${100 - blurWidth}%, rgba(0,0,0,0.15) 100%)
        `,
      }}
    />
  );
};
