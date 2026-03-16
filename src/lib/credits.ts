export type GenerationType = "image" | "remotion" | "premium";

export const CREDIT_COST: Record<GenerationType, number> = {
  image: 1,
  remotion: 1,
  premium: 10,
};

