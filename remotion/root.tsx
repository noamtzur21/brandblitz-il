import React from "react";
import { Composition } from "remotion";
import { BrandBlitzVertical, brandBlitzSchema, type BrandBlitzProps } from "./scenes/BrandBlitzVertical";

/** Heebo Black for TikTok-style bold Hebrew overlay (loaded once for all compositions). */
const FONT_STYLE = (
  <style>
    {`@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@700;900&display=swap');`}
  </style>
);

export const RemotionRoot: React.FC = () => {
  const defaultProps: BrandBlitzProps = {
    imageUrl:
      "https://images.unsplash.com/photo-1520975682038-4adf807d1d54?auto=format&fit=crop&w=1080&q=80",
    text: "כותרת בעברית\nשכבה *מונפשת*",
    videoStyle: "viral",
    motionVariant: "zoomIn",
  };

  return (
    <>
      {FONT_STYLE}
      <Composition
        id="BrandBlitzVertical"
        component={BrandBlitzVertical}
        durationInFrames={8 * 30}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        schema={brandBlitzSchema}
      />
      <Composition
        id="BrandBlitzSquare"
        component={BrandBlitzVertical}
        durationInFrames={8 * 30}
        fps={30}
        width={1080}
        height={1080}
        defaultProps={defaultProps}
        schema={brandBlitzSchema}
      />
      <Composition
        id="BrandBlitzLandscape"
        component={BrandBlitzVertical}
        durationInFrames={8 * 30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps}
        schema={brandBlitzSchema}
      />
    </>
  );
};

