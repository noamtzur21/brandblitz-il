import type { GenerationDoc } from "@/lib/types";

export const DEMO_USER_ID = "demo-user";

export const demoCreditsBalance = 128;

export const demoGenerations: Array<GenerationDoc & { id: string }> = [
  {
    id: "demo-1",
    userId: DEMO_USER_ID,
    niche: "מסעדות",
    type: "image",
    logoUrl: null,
    status: "done",
    resultUrl:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1080&q=80",
    sourceImageUrl: null,
    caption: "מוכן לפוסט? קופי קצר, חד, בעברית. #מסעדות #תל_אביב",
    overlayText: "מנה חדשה שחייבים לטעום\nרק השבוע!",
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    errorMessage: null,
  },
  {
    id: "demo-2",
    userId: DEMO_USER_ID,
    niche: "נדל״ן",
    type: "remotion",
    logoUrl: null,
    status: "rendering",
    sourceImageUrl:
      "https://images.unsplash.com/photo-1523217582562-09d0def993a6?auto=format&fit=crop&w=1080&q=80",
    resultUrl: null,
    caption: "מרנדרים וידאו Remotion... עוד רגע זה מוכן להורדה.",
    overlayText: "סיור קצר בדירה\nשנראית כמו מלון",
    createdAt: Date.now() - 1000 * 60 * 14,
    errorMessage: null,
  },
  {
    id: "demo-3",
    userId: DEMO_USER_ID,
    niche: "קליניקה",
    type: "premium",
    logoUrl: null,
    status: "processing",
    sourceImageUrl: null,
    resultUrl: null,
    caption: null,
    overlayText: null,
    createdAt: Date.now() - 1000 * 60 * 18,
    errorMessage: null,
  },
];

export function getDemoGenById(id: string) {
  return demoGenerations.find((g) => g.id === id) ?? null;
}

