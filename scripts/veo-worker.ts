import "./load-env";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { GoogleAuth } from "google-auth-library";
import { isR2Configured, uploadToR2 } from "./r2-upload";

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL!;
const PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")!;
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || PROJECT_ID;
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west1";
const VEO_LOCATION = process.env.VEO_LOCATION || VERTEX_LOCATION;
const VEO_MODEL_ID = process.env.VEO_MODEL_ID || "veo-3.1-generate-preview";

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  throw new Error("Missing FIREBASE_ADMIN_* env vars for Veo worker.");
}
if (!isR2Configured()) {
  throw new Error(
    "Missing R2_* env vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL).",
  );
}

function getAdmin() {
  if (getApps().length > 0) return getApps()[0]!;
  return initializeApp({
    credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }),
  });
}

const app = getAdmin();
const db = getFirestore(app);

type GenRef = DocumentReference<DocumentData>;
type GenDoc = DocumentData;

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  ...(process.env.VERTEX_CLIENT_EMAIL && process.env.VERTEX_PRIVATE_KEY
    ? {
        credentials: {
          client_email: process.env.VERTEX_CLIENT_EMAIL,
          private_key: process.env.VERTEX_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      }
    : {}),
});

async function getAccessToken() {
  const client = await auth.getClient();
  const tok = await client.getAccessToken();
  const accessToken = typeof tok === "string" ? tok : tok?.token;
  if (!accessToken) throw new Error("Failed to acquire Google access token for Vertex.");
  return accessToken;
}

async function uploadVideoToR2(buf: Buffer, mimeType: string, genId: string) {
  const key = `generated/videos/${genId}.mp4`;
  return await uploadToR2(key, buf, mimeType || "video/mp4");
}

function vertexBase(modelId: string) {
  return `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VEO_LOCATION}/publishers/google/models/${modelId}`;
}

async function veoPredictLongRunning(prompt: string, aspectRatio: string) {
  const token = await getAccessToken();
  const res = await fetch(`${vertexBase(VEO_MODEL_ID)}:predictLongRunning`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio,
        durationSeconds: 8,
        resolution: "720p",
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
  const name = json?.name;
  if (!name) throw new Error("Veo did not return operation name.");
  return String(name);
}

async function veoFetchOp(operationName: string) {
  const token = await getAccessToken();
  const res = await fetch(`${vertexBase(VEO_MODEL_ID)}:fetchPredictOperation`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ operationName }),
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Veo fetch failed (${res.status})`;
    throw new Error(msg);
  }
  return json as any;
}

async function waitForVideoBytes(
  operationName: string,
  onPoll?: (op: any) => Promise<void> | void,
) {
  const start = Date.now();
  const timeoutMs = 25 * 60 * 1000;
  while (Date.now() - start < timeoutMs) {
    const op = await veoFetchOp(operationName);
    if (onPoll) await onPoll(op);
    if (op?.error?.message) throw new Error(op.error.message);
    if (!op?.done) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const filtered = op?.response?.raiMediaFilteredCount;
    if (typeof filtered === "number" && filtered > 0) {
      throw new Error("Veo filtered the generated video due to safety policies.");
    }
    const v = op?.response?.videos?.[0];
    const b64 = v?.bytesBase64Encoded;
    if (!b64) {
      throw new Error("Veo completed but returned no bytesBase64Encoded.");
    }
    return { bytes: Buffer.from(String(b64), "base64"), mimeType: v?.mimeType || "video/mp4" };
  }
  throw new Error("Timed out waiting for Veo.");
}

async function claimNextJob() {
  const LOCK_TTL_MS = 15 * 60 * 1000;
  const snap = await db
    .collection("generations")
    .where("type", "==", "premium")
    .where("status", "==", "processing")
    .orderBy("createdAt", "asc")
    .limit(5)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as GenDoc;
    if (data.resultUrl) continue;
    const ref = doc.ref as GenRef;
    const ok = await db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists) return false;
      const d = s.data() as GenDoc;
      if (d.type !== "premium" || d.status !== "processing" || d.resultUrl) return false;
      const now = Date.now();
      const lockedAt = typeof d.lockedAt === "number" ? d.lockedAt : null;
      if (d.lockedBy && (!lockedAt || now - lockedAt < LOCK_TTL_MS)) return false;
      tx.set(ref, { lockedBy: "veo-worker", lockedAt: now }, { merge: true });
      return true;
    });
    if (ok) return { id: doc.id, ref, data };
  }
  return null;
}

async function processJob(job: { id: string; ref: GenRef; data: GenDoc }) {
  const prompt = String(job.data.videoPrompt || job.data.imagePrompt || "").trim();
  const aspectRatio = String(job.data.aspectRatio || "9:16");
  if (!prompt) {
    await job.ref.set({ status: "error", errorMessage: "Missing videoPrompt for premium job" }, { merge: true });
    return;
  }

  const opName = await veoPredictLongRunning(prompt, aspectRatio);
  await job.ref.set(
    {
      veoOperationName: opName,
      veoModelId: VEO_MODEL_ID,
      premiumStage: "submitted",
      premiumUpdatedAt: Date.now(),
      errorMessage: null,
    },
    { merge: true },
  );
  let lastHeartbeat = 0;
  const { bytes, mimeType } = await waitForVideoBytes(opName, async (op) => {
    const now = Date.now();
    if (now - lastHeartbeat < 30_000) return;
    lastHeartbeat = now;
    await job.ref.set(
      {
        premiumStage: op?.done ? "finalizing" : "generating",
        premiumUpdatedAt: now,
      },
      { merge: true },
    );
  });
  const url = await uploadVideoToR2(bytes, mimeType, job.id);

  await job.ref.set(
    {
      status: "done",
      resultUrl: url,
      rawResultUrl: url,
      errorMessage: null,
      lockedBy: null,
      lockedAt: null,
      veoOperationName: opName,
      veoModelId: VEO_MODEL_ID,
      premiumStage: "done",
      premiumUpdatedAt: Date.now(),
    },
    { merge: true },
  );
}

async function refundCreditsIfNeeded(job: { id: string; ref: GenRef; data: GenDoc }, reason: string) {
  const userId = String(job.data.userId || "").trim();
  if (!userId) return;

  // Ensure we refund only once.
  const snap = await job.ref.get();
  const latest = snap.exists ? (snap.data() as any) : null;
  if (latest?.creditsRefundedAt) return;

  const creditsRef = db.doc(`users/${userId}/credits/summary`);
  await db.runTransaction(async (tx) => {
    const genSnap = await tx.get(job.ref);
    const g = genSnap.exists ? (genSnap.data() as any) : null;
    if (!g) return;
    if (g.creditsRefundedAt) return;

    const cSnap = await tx.get(creditsRef);
    const balance = cSnap.exists && typeof cSnap.get("balance") === "number" ? (cSnap.get("balance") as number) : 0;
    tx.set(creditsRef, { balance: balance + 10, updatedAt: Date.now() }, { merge: true });
    tx.set(job.ref, { creditsRefundedAt: Date.now(), creditsRefundReason: reason }, { merge: true });
  });
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("BrandBlitz Veo worker started. Polling for premium jobs...");
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      // eslint-disable-next-line no-console
      console.log("Picked premium job:", job.id);
      try {
        await processJob(job);
        // eslint-disable-next-line no-console
        console.log("Done premium job:", job.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // eslint-disable-next-line no-console
        console.error("Premium job failed:", job.id, msg);
        await refundCreditsIfNeeded(job, msg);
        await job.ref.set(
          { status: "error", errorMessage: msg, lockedBy: null, lockedAt: null },
          { merge: true },
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Veo worker loop error:", e);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

void main();

