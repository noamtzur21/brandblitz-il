import "server-only";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getRequiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function hasServiceAccountEnv() {
  return (
    !!process.env.FIREBASE_ADMIN_PROJECT_ID &&
    !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
    !!process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );
}

export function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]!;

  const storageBucket =
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    undefined;

  if (hasServiceAccountEnv()) {
    const projectId = getRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
    const clientEmail = getRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
    const privateKey = getRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(
      /\\n/g,
      "\n",
    );

    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      storageBucket,
    });
  }

  // Fallback for local dev / GCP: allow Application Default Credentials (ADC).
  // This works when you've run `gcloud auth application-default login` or set
  // `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON path.
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    undefined;

  return initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
    storageBucket,
  });
}

export function getAdminDb() {
  getAdminApp();
  return getFirestore();
}

export function getAdminAuth() {
  getAdminApp();
  return getAuth();
}

