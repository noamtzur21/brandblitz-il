import "server-only";

import { getAccessToken, getVertexLocation, getVertexProjectId } from "@/lib/vertex/auth";

export type ImagenResult = { bytes: Buffer; mimeType: string; enhancedPrompt?: string };

function endpoint(modelId: string) {
  const project = getVertexProjectId();
  const loc = getVertexLocation();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${modelId}:predict`;
}

export async function imagenGenerate(opts: {
  prompt: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  mimeType?: "image/png" | "image/webp" | "image/jpeg";
}): Promise<ImagenResult> {
  const [one] = await imagenGenerateMany({ ...opts, sampleCount: 1 });
  if (!one) throw new Error("Imagen returned empty image bytes.");
  return one;
}

export async function imagenGenerateMany(opts: {
  prompt: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  mimeType?: "image/png" | "image/webp" | "image/jpeg";
  sampleCount: number;
}): Promise<ImagenResult[]> {
  const token = await getAccessToken();
  const res = await fetch(endpoint("imagen-4.0-generate-001"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: {
        sampleCount: Math.max(1, Math.min(4, Math.floor(opts.sampleCount || 1))),
        aspectRatio: opts.aspectRatio,
        outputOptions: { mimeType: opts.mimeType ?? "image/png" },
        personGeneration: "allow_adult",
        safetySetting: "block_medium_and_above",
        // Without this, filtered images may be omitted from predictions entirely,
        // leaving us with a confusing "empty bytes" error.
        includeRaiReason: true,
      },
    }),
  });

  const jsonText = await res.text().catch(() => "");
  const json = (jsonText ? JSON.parse(jsonText) : null) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Imagen request failed (${res.status})`;
    throw new Error(msg);
  }

  const preds: any[] = Array.isArray(json?.predictions) ? json.predictions : [];
  const results: ImagenResult[] = [];
  for (const pred of preds) {
    const b64 = pred?.bytesBase64Encoded ?? pred?.image?.bytesBase64Encoded ?? null;
    const mimeType = pred?.mimeType || opts.mimeType || "image/png";
    if (!b64) continue;
    results.push({
      bytes: Buffer.from(String(b64), "base64"),
      mimeType: String(mimeType),
      enhancedPrompt: typeof pred?.prompt === "string" ? pred.prompt : undefined,
    });
  }

  if (results.length === 0) {
    const rai =
      preds.find((p) => p?.raiFilteredReason)?.raiFilteredReason ||
      json?.raiFilteredReason ||
      null;
    const hint = rai
      ? `Imagen חסם את התמונה לפי Responsible AI (סיבה: ${String(rai)}). נסה/י לנסח מחדש את הבקשה או להסיר ניסוחים רגישים.`
      : "Imagen החזיר תשובה בלי bytesBase64Encoded. זה לרוב אומר שהתמונה סוננה ע\"י Responsible AI או שהמודל החזיר פורמט לא צפוי.";
    throw new Error(hint);
  }

  return results;
}

