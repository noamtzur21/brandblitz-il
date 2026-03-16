import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { VideoStyle } from "./BrandBlitzVertical";

type AnimatedTextProps = {
  lines: string[];
  videoStyle: VideoStyle;
  /** Frame at which text starts entering (for motion blur window) */
  startFrame: number;
  /** Brand Kit – צבע כותרות (ברירת מחדל #e9eefc) */
  textColor?: string;
  /** Typography variant to make each render feel different */
  textVariant?: "clean" | "outline" | "neon" | "condensed";
};

/** Parse line into segments: normal text or *highlighted* (for yellow accent). */
function parseHighlightSegments(line: string): { text: string; highlight: boolean }[] {
  const segments: { text: string; highlight: boolean }[] = [];
  let rest = line;
  while (rest.length > 0) {
    const open = rest.indexOf("*");
    if (open === -1) {
      if (rest) segments.push({ text: rest, highlight: false });
      break;
    }
    if (open > 0) segments.push({ text: rest.slice(0, open), highlight: false });
    const close = rest.indexOf("*", open + 1);
    if (close === -1) {
      segments.push({ text: rest.slice(open + 1), highlight: true });
      break;
    }
    segments.push({ text: rest.slice(open + 1, close), highlight: true });
    rest = rest.slice(close + 1);
  }
  return segments;
}

/**
 * טיפוגרפיה עם Spring אלסטי (Pop) + מילה-מילה. מילים ב־*כוכביות* מודגשות בצהוב זורח.
 */
export const AnimatedText: React.FC<AnimatedTextProps> = ({
  lines,
  videoStyle,
  startFrame,
  textColor = "#e9eefc",
  textVariant = "clean",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isPopOrViral = videoStyle === "pop" || videoStyle === "viral";
  const wordStagger = videoStyle === "viral" ? 0.9 : isPopOrViral ? 1.2 : videoStyle === "dramatic" ? 4 : 2.2;
  const baseDamping = isPopOrViral ? 10 : 14;
  const baseStiffness = isPopOrViral ? 180 : 120;

  const baseTextShadow =
    textVariant === "neon"
      ? "0 0 14px rgba(0,245,255,0.28), 0 0 24px rgba(255,64,181,0.18), 0 4px 16px rgba(0,0,0,0.9)"
      : "0 3px 4px rgba(0,0,0,0.85), 0 8px 22px rgba(0,0,0,0.9)";

  const fontFamily =
    textVariant === "condensed"
      ? "'Rubik', 'Heebo', system-ui, sans-serif"
      : "'Heebo', 'Rubik', system-ui, sans-serif";

  const letterSpacing =
    textVariant === "condensed" ? "-0.03em" : textVariant === "clean" ? "-0.02em" : "-0.015em";

  const stroke =
    textVariant === "outline" ? "2px rgba(0,0,0,0.8)" : textVariant === "clean" ? "1.5px rgba(0,0,0,0.55)" : "0px transparent";

  return (
    <div
      style={{
        direction: "rtl",
        textAlign: "center",
        fontFamily,
        fontWeight: 900,
        fontSize: 58,
        lineHeight: 1.05,
        letterSpacing,
        color: textColor,
        textShadow: baseTextShadow,
        whiteSpace: "pre-line",
      }}
    >
      {lines.map((line, lineIdx) => {
        const segments = parseHighlightSegments(line);
        const wordsWithHighlight: { word: string; highlight: boolean }[] = [];
        for (const seg of segments) {
          for (const w of seg.text.split(/\s+/).filter(Boolean)) {
            wordsWithHighlight.push({ word: w, highlight: seg.highlight });
          }
        }
        const totalWordsBeforeLine = lines
          .slice(0, lineIdx)
          .reduce((acc, l) => acc + parseHighlightSegments(l).reduce((a, s) => a + s.text.split(/\s+/).filter(Boolean).length, 0), 0);

        return (
          <div key={lineIdx} style={{ display: "block", marginBottom: lineIdx < lines.length - 1 ? 8 : 0 }}>
            {wordsWithHighlight.map(({ word, highlight: isHighlight }, wordIdx) => {
              const delay = (totalWordsBeforeLine + wordIdx) * wordStagger;
              const springValue = spring({
                frame: frame - startFrame - delay,
                fps,
                config: {
                  damping: baseDamping,
                  mass: 0.45,
                  stiffness: baseStiffness,
                  overshootClamping: false,
                },
                from: 0,
                to: 1,
                durationInFrames: isPopOrViral ? 18 : 25,
              });
              const opacity = springValue;
              const translateY = interpolate(springValue, [0, 1], [28, 0], { extrapolateRight: "clamp" });
              const scale =
                isPopOrViral
                  ? interpolate(springValue, [0, 1], [0.35, 1.08], { extrapolateRight: "clamp" })
                  : interpolate(springValue, [0, 1], [0.85, 1], { extrapolateRight: "clamp" });
              const motionBlur = springValue < 0.92 ? interpolate(springValue, [0, 0.92], [2.5, 0], { extrapolateRight: "clamp" }) : 0;
              const pulse = isHighlight ? 1 + Math.sin(frame * 0.12) * 0.04 : 1;

              return (
                <span
                  key={`${lineIdx}-${wordIdx}`}
                  style={{
                    display: "inline-block",
                    marginLeft: 10,
                    opacity,
                    transform: `translateY(${translateY}px) scale(${scale * pulse})`,
                    filter: motionBlur > 0 ? `blur(${motionBlur}px)` : "none",
                    color: isHighlight ? "#fde047" : undefined,
                    textShadow: isHighlight
                      ? "0 0 20px rgba(253,224,71,0.7), 0 3px 4px #000, 0 6px 16px rgba(0,0,0,0.9)"
                      : baseTextShadow,
                    WebkitTextStroke: isHighlight ? "0px transparent" : stroke,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
