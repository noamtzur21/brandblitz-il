import "server-only";

import { getAccessToken, getVertexLocation, getVertexProjectId } from "@/lib/vertex/auth";

type PredictLongRunningResponse = { name: string };
type FetchOpResponse = {
  done?: boolean;
  error?: { message?: string };
  response?: {
    videos?: Array<{
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType?: string;
    }>;
    raiMediaFilteredCount?: number;
  };
};

function baseModelPath(modelId: string) {
  const project = getVertexProjectId();
  const loc = getVertexLocation();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${modelId}`;
}

export async function veoPredictLongRunning(opts: {
  prompt: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  durationSeconds?: number;
  resolution?: "720p" | "1080p";
}): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(`${baseModelPath("veo-3.1-generate-001")}:predictLongRunning`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      instances: [{ prompt: opts.prompt }],
      parameters: {
        aspectRatio: opts.aspectRatio,
        durationSeconds: opts.durationSeconds ?? 8,
        resolution: opts.resolution ?? "720p",
        sampleCount: 1,
        generateAudio: false,
      },
    }),
  });

  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Veo request failed (${res.status})`;
    throw new Error(msg);
  }
  const name = (json as PredictLongRunningResponse).name;
  if (!name) throw new Error("Veo did not return an operation name.");
  return name;
}

export async function veoFetchOperation(operationName: string): Promise<FetchOpResponse> {
  const token = await getAccessToken();
  const res = await fetch(`${baseModelPath("veo-3.1-generate-001")}:fetchPredictOperation`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ operationName }),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Veo operation fetch failed (${res.status})`;
    throw new Error(msg);
  }
  return json as FetchOpResponse;
}

export async function veoWaitForVideoBytes(opts: {
  operationName: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000;
  const poll = opts.pollIntervalMs ?? 3000;

  while (Date.now() - started < timeoutMs) {
    const op = await veoFetchOperation(opts.operationName);
    if (op.error?.message) throw new Error(op.error.message);
    if (!op.done) {
      await new Promise((r) => setTimeout(r, poll));
      continue;
    }
    const v = op.response?.videos?.[0];
    if (op.response?.raiMediaFilteredCount && op.response.raiMediaFilteredCount > 0) {
      throw new Error("Veo filtered the generated video due to safety policies.");
    }
    if (v?.bytesBase64Encoded) {
      return {
        bytes: Buffer.from(v.bytesBase64Encoded, "base64"),
        mimeType: v.mimeType || "video/mp4",
      };
    }
    if (v?.gcsUri) {
      throw new Error("Veo returned only a GCS URI. Configure storage download or request bytes output.");
    }
    throw new Error("Veo completed but returned no video bytes.");
  }
  throw new Error("Timed out waiting for Veo video generation.");
}

