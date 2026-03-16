/**
 * Cloudflare R2 upload (S3-compatible API).
 * Used by API routes (e.g. upload-media) and by scripts/remotion-worker via scripts/r2-upload.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function getEnv() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrlBase: process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "",
  };
}

export function isR2Configured(): boolean {
  const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrlBase } = getEnv();
  return !!(accountId && accessKeyId && secretAccessKey && bucketName && publicUrlBase);
}

function getClient(): S3Client {
  const { accountId, accessKeyId, secretAccessKey } = getEnv();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

/**
 * Uploads a buffer to R2 and returns the public URL.
 * @param key - Object key (e.g. "user-media/uid/uploadId/0.jpg")
 * @param body - File buffer
 * @param contentType - e.g. "image/jpeg"
 */
export async function uploadToR2(
  key: string,
  body: Buffer<ArrayBufferLike>,
  contentType: string,
): Promise<string> {
  const { bucketName, publicUrlBase } = getEnv();
  if (!bucketName || !publicUrlBase) {
    throw new Error("Missing R2_BUCKET_NAME or R2_PUBLIC_URL.");
  }
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${publicUrlBase}/${key}`;
}
