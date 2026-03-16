import "server-only";

import { getAccessToken, getVertexLocation, getVertexProjectId } from "@/lib/vertex/auth";

type GeminiInlineDataPart = { inlineData: { mimeType: string; data: string } };
type GeminiTextPart = { text: string };
type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart;

type GeminiResponseTextPart = { text?: string };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiResponseTextPart[] } }>;
  error?: { message?: string };
};

type GeminiJsonOut = {
  caption: string;
  overlayText: string;
  hashtags?: string[]; // Hebrew hashtags (with #)
  prompt: string; // image prompt (English)
  videoPrompt?: string; // video prompt (English)
  audioVibe?: "energetic" | "calm" | "luxury" | "trendy";
  sfxUrl?: string | null;
};

const IMAGEN_PROMPT_SUFFIX =
  'No text, no letters, no captions, no subtitles, no labels, no signage, no watermarks. Leave clean empty space in the upper third.';

function looksLikeBadImagenPrompt(prompt: string): boolean {
  const p = prompt.toLowerCase();
  // Common failure modes: models generate subtitle-like boxes when prompt mentions them,
  // or when the prompt contains meta tokens like "detail:".
  const banned = [
    "subtitle",
    "subtitles",
    "caption box",
    "caption boxes",
    "caption",
    "text overlay",
    "overlay text",
    "typography",
    "headline",
    "title text",
    "lower third",
    "label",
    "labels",
    "watermark",
    "detail:",
    "details:",
  ];
  if (banned.some((w) => p.includes(w))) return true;
  if (!prompt.trim().endsWith(IMAGEN_PROMPT_SUFFIX)) return true;
  return false;
}

function endpoint(modelId: string) {
  const project = getVertexProjectId();
  const loc = getVertexLocation();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${modelId}:generateContent`;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractJsonObjectText(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Strip common markdown fences.
  const noFences = s
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  const first = noFences.indexOf("{");
  const last = noFences.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return noFences.slice(first, last + 1);
}

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function geminiGenerateBrief(opts: {
  niche: string;
  /** Hebrew free-form request (what to create). */
  userRequest?: string | null;
  type: "image" | "remotion" | "premium";
  selectedStyle?: string | null;
  customPrompt?: string | null;
  /** Optional image bytes to use as Vision input (first upload) */
  visionImage?: { bytesBase64: string; mimeType: string } | null;
}): Promise<GeminiJsonOut> {
  const baseSystemInstruction = `OUTPUT FORMAT (STRICT): Return a RAW JSON object ONLY. No markdown. No prose. Start with { and end with }.

You are a marketing copywriter for Israeli social media.
Input: niche (Hebrew), userRequest (Hebrew, optional), type (image/remotion/premium).

Return JSON with:
- caption: Hebrew marketing copy (1-2 short sentences, max ~180 chars).
- hashtags: Array of 3-6 Hebrew hashtags, each starting with #.
- overlayText: Short Hebrew headline (max 2 lines). Keep it very short.
- prompt: English image description for a text-to-image model. MUST end with: "${IMAGEN_PROMPT_SUFFIX}"
- videoPrompt: (only if type=premium) English prompt for text-to-video, cinematic, 8s, vertical-friendly.

Never include Hebrew text inside prompt/videoPrompt. No lists.
CRITICAL: The prompt MUST NOT mention subtitles, captions, text overlays, words, letters, typography, labels, signs, watermark, or any on-image text.`;

  const userText = [
    `Niche (Hebrew): ${opts.niche}`,
    opts.userRequest ? `User request (Hebrew): ${opts.userRequest}` : null,
    `Type: ${opts.type}`,
    opts.type === "premium" && opts.selectedStyle ? `Premium style: ${opts.selectedStyle}` : null,
    opts.type === "premium" && opts.customPrompt ? `Custom style: ${opts.customPrompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const contentsParts: GeminiRequestPart[] = [{ text: userText }];
  if (opts.visionImage?.bytesBase64 && opts.visionImage.mimeType) {
    contentsParts.push({
      inlineData: {
        mimeType: opts.visionImage.mimeType,
        data: opts.visionImage.bytesBase64,
      },
    });
  }

  const body = {
    systemInstruction: { parts: [{ text: baseSystemInstruction }] },
    contents: [{ role: "user", parts: contentsParts }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1800,
      responseMimeType: "application/json",
    },
  };

  const token = await getAccessToken();

  // Retry policy:
  // - Attempt 0: normal instruction
  // - Attempt 1: stricter JSON
  // - Attempt 2: enforce REQUIRED fields explicitly (prompt/videoPrompt) + lower temperature
  const attempts = [
    { extraInstruction: "", temperature: 0.6, maxOutputTokens: 1800 },
    {
      extraInstruction:
        "\n\nIMPORTANT: Output MUST be valid JSON. Keep all strings short. Do not truncate. Do not include trailing commas.",
      temperature: 0.3,
      maxOutputTokens: 2200,
    },
    {
      extraInstruction:
        "\n\nCRITICAL REQUIREMENTS:\n" +
        '- JSON MUST contain non-empty strings for: caption, overlayText, prompt.\n' +
        (opts.type === "premium" ? "- JSON MUST contain non-empty string for: videoPrompt.\n" : "") +
        '- prompt MUST be English and MUST end with: "No text, no letters on the image. Negative space for text overlay."\n' +
        "- Return ONLY ONE JSON object.",
      temperature: 0.2,
      maxOutputTokens: 2400,
    },
  ] as const;

  let lastRawText = "";
  let parsed: Partial<GeminiJsonOut> | null = null;

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    const cfg = attempts[attempt]!;
    const reqBody = {
      ...body,
      systemInstruction: {
        parts: [{ text: baseSystemInstruction + cfg.extraInstruction }],
      },
      generationConfig: {
        ...body.generationConfig,
        temperature: cfg.temperature,
        maxOutputTokens: cfg.maxOutputTokens,
      },
    };

    const res = await fetch(endpoint("gemini-2.5-flash"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(reqBody),
    });

    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) {
      const msg = json?.error?.message || `Gemini request failed (${res.status})`;
      throw new Error(msg);
    }

    const text =
      json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ??
      "";
    lastRawText = text;
    const extracted = extractJsonObjectText(text) ?? text.trim();
    parsed = safeJsonParse<Partial<GeminiJsonOut>>(extracted);
    if (!parsed) continue;

    const parsedLoose = parsed as Partial<GeminiJsonOut> & {
      prompt?: unknown;
      imagePrompt?: unknown;
      hashtags?: unknown;
      videoPrompt?: unknown;
      audioVibe?: unknown;
      sfxUrl?: unknown;
    };

    const outPrompt = normalizeText(parsedLoose.prompt || parsedLoose.imagePrompt);
    const outVideoPrompt = normalizeText(parsedLoose.videoPrompt);
    if (!outPrompt) continue;
    if (looksLikeBadImagenPrompt(outPrompt)) continue;
    if (opts.type === "premium" && !outVideoPrompt) continue;
    break;
  }

  if (!parsed) {
    const sample = lastRawText.trim().slice(0, 600);
    throw new Error(
      `Gemini returned non-JSON output.\n---\n${sample}${lastRawText.trim().length > 600 ? "\n..." : ""}`,
    );
  }

  const parsedLoose = parsed as Partial<GeminiJsonOut> & {
    prompt?: unknown;
    imagePrompt?: unknown;
    hashtags?: unknown;
    videoPrompt?: unknown;
    audioVibe?: unknown;
    sfxUrl?: unknown;
  };

  const audioVibeRaw = normalizeText(parsedLoose.audioVibe);
  const audioVibe =
    audioVibeRaw === "energetic" || audioVibeRaw === "calm" || audioVibeRaw === "luxury" || audioVibeRaw === "trendy"
      ? (audioVibeRaw as GeminiJsonOut["audioVibe"])
      : undefined;

  const out: GeminiJsonOut = {
    caption: normalizeText(parsed.caption) || "קופי בעברית",
    overlayText: normalizeText(parsed.overlayText) || "כותרת בעברית",
    hashtags: Array.isArray(parsedLoose.hashtags)
      ? parsedLoose.hashtags.map((h) => normalizeText(h)).filter(Boolean)
      : undefined,
    prompt: normalizeText(parsedLoose.prompt || parsedLoose.imagePrompt),
    videoPrompt: normalizeText(parsedLoose.videoPrompt) || undefined,
    audioVibe,
    sfxUrl: typeof parsedLoose.sfxUrl === "string" ? parsedLoose.sfxUrl : null,
  };

  if (!out.prompt) {
    throw new Error("Gemini output missing required field: prompt");
  }
  if (opts.type === "premium" && !out.videoPrompt) {
    // Fallback: use the image prompt if videoPrompt missing.
    out.videoPrompt = out.prompt;
  }
  return out;
}

