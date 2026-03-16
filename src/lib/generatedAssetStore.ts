import "server-only";

import { uploadToR2, isR2Configured } from "@/lib/r2";

function extFromMime(mimeType: string): string {
  const mt = mimeType.toLowerCase();
  if (mt.includes("png")) return "png";
  if (mt.includes("webp")) return "webp";
  if (mt.includes("jpeg") || mt.includes("jpg")) return "jpg";
  if (mt.includes("mp4")) return "mp4";
  if (mt.includes("webm")) return "webm";
  return "bin";
}

export async function storeGeneratedAsset(opts: {
  kind: "images" | "videos";
  genId: string;
  /** Optional suffix, e.g. "-1" for additional variants. */
  suffix?: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<string> {
  if (!isR2Configured()) {
    throw new Error(
      "R2 לא מוגדר. הוסף R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL ל-.env.local",
    );
  }
  const ext = extFromMime(opts.mimeType);
  const safeSuffix = opts.suffix ? String(opts.suffix) : "";
  const key = `generated/${opts.kind}/${opts.genId}${safeSuffix}.${ext}`;
  return await uploadToR2(key, opts.bytes, opts.mimeType);
}

