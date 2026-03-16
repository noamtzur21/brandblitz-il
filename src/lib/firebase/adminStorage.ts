import "server-only";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "./admin";

export function getAdminBucket() {
  const app = getAdminApp();
  const bucketName =
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!bucketName) {
    throw new Error(
      "Missing FIREBASE_ADMIN_STORAGE_BUCKET (or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).",
    );
  }

  return getStorage(app).bucket(bucketName);
}

