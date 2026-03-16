/**
 * Cloudflare R2 upload (S3-compatible API).
 * משמש את ה-worker להעלאת וידאו Remotion – אפס egress, זול scale.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;
const publicUrlBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "") ?? "";

export function isR2Configured(): boolean {
  return !!(accountId && accessKeyId && secretAccessKey && bucketName && publicUrlBase);
}

function getClient(): S3Client {
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
 * @param key - Object key (e.g. "generations/abc123/video.mp4")
 * @param body - File buffer
 * @param contentType - e.g. "video/mp4"
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
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
