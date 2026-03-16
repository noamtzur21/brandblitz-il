import "server-only";

import { GoogleAuth } from "google-auth-library";

function getProjectId(): string {
  return (
    process.env.VERTEX_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    ""
  );
}

export function getVertexLocation(): string {
  return process.env.VERTEX_LOCATION || "europe-west1";
}

export function getVertexProjectId(): string {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error(
      "Missing VERTEX_PROJECT_ID (or GOOGLE_CLOUD_PROJECT / FIREBASE_ADMIN_PROJECT_ID) for Vertex AI calls.",
    );
  }
  return projectId;
}

let _auth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (_auth) return _auth;
  const vertexClientEmail = process.env.VERTEX_CLIENT_EMAIL || null;
  const vertexPrivateKeyRaw = process.env.VERTEX_PRIVATE_KEY || null;
  const vertexPrivateKey = vertexPrivateKeyRaw
    ? vertexPrivateKeyRaw.replace(/\\n/g, "\n")
    : null;

  // If Vertex is configured to use a separate project, DO NOT silently fall back
  // to Firebase Admin credentials (they likely belong to a different project).
  // In local dev, prefer ADC via GOOGLE_APPLICATION_CREDENTIALS.
  const vertexProjectExplicit = !!process.env.VERTEX_PROJECT_ID;

  if (vertexClientEmail && vertexPrivateKey) {
    _auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
      credentials: { client_email: vertexClientEmail, private_key: vertexPrivateKey },
    });
    return _auth;
  }

  if (vertexProjectExplicit) {
    _auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    return _auth;
  }

  // Same-project fallback: use Firebase Admin credentials.
  const fbClientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || null;
  const fbPrivateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY || null;
  const fbPrivateKey = fbPrivateKeyRaw ? fbPrivateKeyRaw.replace(/\\n/g, "\n") : null;

  _auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(fbClientEmail && fbPrivateKey
      ? { credentials: { client_email: fbClientEmail, private_key: fbPrivateKey } }
      : {}),
  });
  return _auth;
}

export async function getAccessToken(): Promise<string> {
  try {
    const client = await getAuth().getClient();
    const token = await client.getAccessToken();
    const accessToken = typeof token === "string" ? token : token?.token;
    if (!accessToken) {
      throw new Error("Failed to acquire Google access token (ADC/service account).");
    }
    return accessToken;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Could not load the default credentials/i.test(msg)) {
      throw new Error(
        [
          "Vertex: לא נמצאו Credentials (ADC).",
          "בפיתוח מקומי צריך להגדיר Service Account אחד מהבאים:",
          '1) `.env.local`: `GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"`',
          "או",
          '2) להריץ טרמינל: `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json" && npm run dev`',
        ].join("\n"),
      );
    }
    throw e;
  }
}

