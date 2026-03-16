import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import {
  DramaticOverlay,
  FilmGrainOverlay,
  LightLeaksOverlay,
  ParticlesOverlay,
} from "./overlays";
import { AnimatedText } from "./AnimatedText";

export const HOOK_VARIANTS = ["none", "shake", "punch", "swipe"] as const;
export type HookVariant = (typeof HOOK_VARIANTS)[number];

/** Hook: first ~1s impact. Different every render based on hookVariant. */
function useHookTransform(frame: number, variant: HookVariant = "shake") {
  if (variant === "none") return { scale: 1, shakeX: 0, shakeY: 0, rotate: 0 };

  const zoomIn = interpolate(frame, [0, 12], [1, 1.04], { easing: Easing.out(Easing.cubic), extrapolateRight: "clamp" });
  const settle = interpolate(frame, [12, 35], [1.04, 1], { easing: Easing.inOut(Easing.cubic), extrapolateRight: "clamp" });
  const scale = frame < 12 ? zoomIn : settle;

  if (variant === "punch") {
    const rot = interpolate(frame, [0, 10, 28], [0.8, -0.4, 0], { extrapolateRight: "clamp" });
    return { scale: scale * 1.01, shakeX: 0, shakeY: 0, rotate: rot };
  }

  if (variant === "swipe") {
    const x = interpolate(frame, [0, 10, 24], [18, -10, 0], { extrapolateRight: "clamp" });
    const y = interpolate(frame, [0, 10, 24], [-6, 6, 0], { extrapolateRight: "clamp" });
    const rot = interpolate(frame, [0, 10, 24], [-1.2, 0.6, 0], { extrapolateRight: "clamp" });
    return { scale: scale * 1.015, shakeX: x, shakeY: y, rotate: rot };
  }

  // shake
  const shakeMagnitude = frame < 15 ? 5 : 0;
  const shake = frame < 15 ? Math.sin(frame * 4) * shakeMagnitude + Math.sin(frame * 2.2) * (shakeMagnitude * 0.6) : 0;
  return { scale, shakeX: shake, shakeY: shake * 0.7, rotate: 0 };
}

/** Strong white flash on first frames – scroll stopper. */
function useFlashOpacity(frame: number) {
  return interpolate(frame, [0, 1, 4], [0.55, 0.12, 0], { extrapolateRight: "clamp" });
}

export const VIDEO_STYLES = ["default", "pop", "dramatic", "viral"] as const;
export type VideoStyle = (typeof VIDEO_STYLES)[number];

export const MOTION_VARIANTS = ["zoomIn", "zoomOut", "panLeft", "panRight"] as const;
export type MotionVariant = (typeof MOTION_VARIANTS)[number];

export const TEXT_ENTRY_VARIANTS = ["fade-up", "scale-in", "slide-from-side"] as const;
export type TextEntryVariant = (typeof TEXT_ENTRY_VARIANTS)[number];

export const OVERLAY_VARIANTS = ["minimal", "clean", "party", "dramatic"] as const;
export type OverlayVariant = (typeof OVERLAY_VARIANTS)[number];

export const TEXT_VARIANTS = ["clean", "outline", "neon", "condensed"] as const;
export type TextVariant = (typeof TEXT_VARIANTS)[number];

export const brandBlitzSchema = z.object({
  imageUrl: z.string().url(),
  /** When set, multi-image slideshow (חומרי גלם). Each image gets equal segment with Ken Burns. */
  images: z.array(z.string().url()).optional(),
  text: z.string().min(1),
  videoStyle: z.enum(VIDEO_STYLES).optional(),
  hookVariant: z.enum(HOOK_VARIANTS).optional(),
  musicUrl: z.string().url().optional().nullable(),
  musicStartFromFrame: z.number().min(0).optional(),
  playbackRate: z.number().min(0.5).max(2).optional(),
  sfxUrl: z.string().url().optional().nullable(),
  hookSfxUrl: z.string().url().optional().nullable(),
  motionVariant: z.enum(MOTION_VARIANTS).optional(),
  textEntryVariant: z.enum(TEXT_ENTRY_VARIANTS).optional(),
  overlayVariant: z.enum(OVERLAY_VARIANTS).optional(),
  textVariant: z.enum(TEXT_VARIANTS).optional(),
  /** Brand Kit – לוגו בפינה + מסך סיום */
  brandLogoUrl: z.string().url().optional(),
  brandPrimaryColor: z.string().optional(),
});

/** Parse line for *highlighted* segments (same logic as AnimatedText). */
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

const WORD_STAGGER_BY_STYLE: Record<VideoStyle, number> = {
  pop: 1.2,
  dramatic: 4,
  default: 2.2,
  viral: 0.9,
};

/** Frame at which the first *highlighted* word pops (or first word if none). SFX plays here. */
function getSfxStartFrame(
  text: string,
  videoStyle: VideoStyle,
  textStartFrame: number,
): number {
  const lines = text.split("\n").slice(0, 5).map((s) => s.trim()).filter(Boolean);
  const wordStagger = WORD_STAGGER_BY_STYLE[videoStyle];
  let globalIndex = 0;
  for (const line of lines) {
    const segments = parseHighlightSegments(line);
    for (const seg of segments) {
      const words = seg.text.split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i++) {
        if (seg.highlight) return Math.round(textStartFrame + globalIndex * wordStagger);
        globalIndex++;
      }
    }
  }
  return textStartFrame;
}

export type BrandBlitzProps = z.infer<typeof brandBlitzSchema>;

/** One image segment in slideshow: Ken Burns over segmentDuration frames. */
function SegmentSlide({
  imageUrl,
  segmentDuration,
  motionVariant,
}: {
  imageUrl: string;
  segmentDuration: number;
  motionVariant: MotionVariant;
}) {
  const frame = useCurrentFrame();
  const motion = useBackgroundMotion(frame, segmentDuration, motionVariant);
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${motion.scale}) translate(${motion.x}px, ${motion.y}px)`,
      }}
    >
      <Img
        src={imageUrl}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
}

/** Dynamic background: zoom in/out or pan so each video feels different. */
function useBackgroundMotion(
  frame: number,
  durationInFrames: number,
  variant: MotionVariant = "zoomIn",
) {
  const t = frame / durationInFrames;
  switch (variant) {
    case "zoomOut":
      return {
        scale: interpolate(t, [0, 1], [1.15, 1], { extrapolateRight: "clamp" }),
        x: 0,
        y: 0,
      };
    case "panLeft":
      return {
        scale: interpolate(t, [0, 1], [1, 1.08], { extrapolateRight: "clamp" }),
        x: interpolate(t, [0, 1], [0, -25], { extrapolateRight: "clamp" }),
        y: interpolate(t, [0, 1], [0, 8], { extrapolateRight: "clamp" }),
      };
    case "panRight":
      return {
        scale: interpolate(t, [0, 1], [1, 1.08], { extrapolateRight: "clamp" }),
        x: interpolate(t, [0, 1], [0, 25], { extrapolateRight: "clamp" }),
        y: interpolate(t, [0, 1], [0, -8], { extrapolateRight: "clamp" }),
      };
    default:
      return {
        scale: interpolate(t, [0, 1], [1, 1.12], { extrapolateRight: "clamp" }),
        x: 0,
        y: 0,
      };
  }
}

function useStyleMotion(
  frame: number,
  durationInFrames: number,
  style: VideoStyle = "default",
  textEntryVariant: TextEntryVariant = "fade-up",
) {
  const isViralOrPop = style === "viral" || style === "pop";
  const zoom =
    style === "dramatic"
      ? interpolate(frame, [0, durationInFrames], [1.0, 1.2], { extrapolateRight: "clamp" })
      : isViralOrPop
        ? interpolate(frame, [0, durationInFrames], [1.0, 1.08], { extrapolateRight: "clamp" })
        : interpolate(frame, [0, durationInFrames], [1.0, 1.12], { extrapolateRight: "clamp" });

  if (isViralOrPop) {
    const fadeUp = () => {
      const enterY = interpolate(frame, [0, 25], [80, 0], {
        easing: Easing.out(Easing.back(1.2)),
        extrapolateRight: "clamp",
      });
      const scale = interpolate(frame, [0, 18], [0.4, 1.05], {
        easing: Easing.out(Easing.back(0.8)),
        extrapolateRight: "clamp",
      });
      const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
      return { enterY, enterX: 0, scale, opacity };
    };
    const scaleIn = () => {
      const enterY = 0;
      const enterX = 0;
      const scale = interpolate(frame, [0, 22], [0.3, 1], {
        easing: Easing.out(Easing.back(0.9)),
        extrapolateRight: "clamp",
      });
      const opacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
      return { enterY, enterX, scale, opacity };
    };
    const slideFromSide = () => {
      const enterY = 0;
      const enterX = interpolate(frame, [0, 20], [120, 0], {
        easing: Easing.out(Easing.cubic),
        extrapolateRight: "clamp",
      });
      const scale = 1;
      const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
      return { enterY, enterX, scale, opacity };
    };
    const motion =
      textEntryVariant === "scale-in"
        ? scaleIn()
        : textEntryVariant === "slide-from-side"
          ? slideFromSide()
          : fadeUp();
    return { zoom, ...motion, textStartFrame: 0 };
  }

  if (style === "dramatic") {
    const enterY = 0;
    const enterX = 0;
    const scale = 1;
    const opacity = interpolate(frame, [15, 60], [0, 1], {
      easing: Easing.inOut(Easing.cubic),
      extrapolateRight: "clamp",
    });
    return { zoom, enterY, enterX, scale, opacity, textStartFrame: 18 };
  }

  const enterY = interpolate(frame, [0, 20], [60, 0], {
    easing: Easing.out(Easing.cubic),
    extrapolateRight: "clamp",
  });
  const enterX = 0;
  const scale = 1;
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return { zoom, enterY, enterX, scale, opacity, textStartFrame: 5 };
}

export const BrandBlitzVertical: React.FC<BrandBlitzProps> = ({
  imageUrl,
  images,
  text,
  videoStyle = "default",
  hookVariant = "shake",
  musicUrl,
  musicStartFromFrame = 0,
  playbackRate = 1,
  sfxUrl,
  hookSfxUrl,
  motionVariant = "zoomIn",
  textEntryVariant = "fade-up",
  overlayVariant = "clean",
  textVariant = "clean",
  brandLogoUrl,
  brandPrimaryColor,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { enterY, enterX, scale, opacity, textStartFrame } = useStyleMotion(
    frame,
    durationInFrames,
    videoStyle,
    textEntryVariant,
  );
  const bgMotion = useBackgroundMotion(frame, durationInFrames, motionVariant);

  const isSlideshow = images && images.length > 1;
  const segmentDuration = isSlideshow ? Math.floor(durationInFrames / images!.length) : durationInFrames;
  const textColor = brandPrimaryColor ?? "#e9eefc";
  const OUTRO_DURATION = 60; // 2 sec at 30fps
  const showOutro = !!brandLogoUrl && durationInFrames > OUTRO_DURATION;

  const lines = text.split("\n").slice(0, 5).map((s) => s.trim()).filter(Boolean);
  const hasWords = lines.some((l) => l.split(/\s+/).some((w) => w.length > 0));
  const fallbackLines = lines.length > 0 ? lines : ["טקסט"];

  const vignetteOpacity = videoStyle === "dramatic" ? 0.75 : 0.6;
  const sfxStartFrame = getSfxStartFrame(text, videoStyle, textStartFrame);

  const hook = useHookTransform(frame, hookVariant);
  const flashOpacity = useFlashOpacity(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05060a" }}>
      {/* Hook: zoom + shake applied to main content (first ~1.5s) */}
      <AbsoluteFill
        style={{
          transform: `scale(${hook.scale}) translate(${hook.shakeX}px, ${hook.shakeY}px) rotate(${hook.rotate}deg)`,
        }}
      >
        {/* Layer 1: Dynamic background – single image or multi-image slideshow (חומרי גלם) */}
        {isSlideshow ? (
          images!.map((url, i) => (
            <Sequence
              key={i}
              from={i * segmentDuration}
              durationInFrames={segmentDuration}
            >
              <SegmentSlide
                imageUrl={url}
                segmentDuration={segmentDuration}
                motionVariant={motionVariant}
              />
            </Sequence>
          ))
        ) : (
          <AbsoluteFill
            style={{
              transform: `scale(${bgMotion.scale}) translate(${bgMotion.x}px, ${bgMotion.y}px)`,
            }}
          >
            <Img
              src={imageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </AbsoluteFill>
        )}

      {/* Layer 2: Base vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 60% at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
        }}
      />

      {/* Layer 3: Visual overlays – randomized by overlayVariant */}
      {overlayVariant === "minimal" ? (
        <FilmGrainOverlay />
      ) : overlayVariant === "party" ? (
        <>
          <LightLeaksOverlay />
          <ParticlesOverlay />
          <FilmGrainOverlay />
        </>
      ) : overlayVariant === "dramatic" ? (
        <>
          <FilmGrainOverlay />
          <DramaticOverlay intensity={1.15} />
        </>
      ) : (
        <>
          <LightLeaksOverlay />
          <FilmGrainOverlay />
          <DramaticOverlay intensity={0.35} />
        </>
      )}

      {/* Audio: optional music (random start + playbackRate for uniqueness) + SFX on text enter */}
      {musicUrl ? (
        <Audio
          src={musicUrl}
          volume={0.4}
          trimBefore={musicStartFromFrame}
          playbackRate={playbackRate}
        />
      ) : null}
      {hookSfxUrl ? (
        <Sequence from={0}>
          <Audio src={hookSfxUrl} volume={0.5} />
        </Sequence>
      ) : null}
      {sfxUrl ? (
        <Sequence from={sfxStartFrame}>
          <Audio src={sfxUrl} volume={0.6} />
        </Sequence>
      ) : null}

      {/* Layer 4: Text – centered, no background frame */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 120,
          paddingBottom: 120,
          paddingLeft: 56,
          paddingRight: 56,
        }}
      >
        <div style={{ width: "100%", maxWidth: 760 }}>
          <div
            style={{
              direction: "rtl",
              textAlign: "center",
              transform: `translate(${enterX}px, ${enterY}px) scale(${scale})`,
              opacity,
            }}
          >
            {hasWords ? (
              <AnimatedText
                lines={fallbackLines}
                videoStyle={videoStyle}
                startFrame={textStartFrame}
                textColor={textColor}
                textVariant={textVariant}
              />
            ) : (
              <div
                style={{
                  fontFamily: "'Heebo', 'Rubik', system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 58,
                  lineHeight: 1.05,
                  color: textColor,
                  textShadow:
                    "0 3px 4px rgba(0,0,0,0.85), 0 8px 22px rgba(0,0,0,0.9)",
                  WebkitTextStroke: "1.5px rgba(0,0,0,0.55)",
                  whiteSpace: "pre-line",
                  textAlign: "center",
                }}
              >
                {text.trim() || "כותרת"}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
      </AbsoluteFill>

      {/* Flash: very short white flash on first frames (scroll stopper) */}
      <AbsoluteFill
        style={{
          backgroundColor: "#fff",
          opacity: flashOpacity,
          pointerEvents: "none",
        }}
      />

      {/* Brand Kit: Watermark (לוגו בפינה) */}
      {brandLogoUrl ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-start",
            alignItems: "flex-end",
            paddingTop: 52,
            paddingRight: 32,
            paddingLeft: 32,
            pointerEvents: "none",
          }}
        >
          <Img
            src={brandLogoUrl}
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
              opacity: 0.85,
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
            }}
          />
        </AbsoluteFill>
      ) : null}

      {/* Brand Kit: Outro (מסך סיום עם לוגו) */}
      {showOutro ? (
        <Sequence from={durationInFrames - OUTRO_DURATION} durationInFrames={OUTRO_DURATION}>
          <AbsoluteFill
            style={{
              backgroundColor: "rgba(5,6,10,0.92)",
              justifyContent: "center",
              alignItems: "center",
              padding: 48,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, direction: "rtl" }}>
              {brandLogoUrl ? (
                <Img
                  src={brandLogoUrl}
                  style={{
                    width: 140,
                    height: 140,
                    objectFit: "contain",
                    filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.4))",
                  }}
                />
              ) : null}
              <div
                style={{
                  fontFamily: "'Heebo', 'Rubik', system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 26,
                  color: textColor,
                  textAlign: "center",
                }}
              >
                BrandBlitz
              </div>
            </div>
          </AbsoluteFill>
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
