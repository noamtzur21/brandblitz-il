import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { isR2Configured, uploadToR2 } from "@/lib/r2";
import sharp from "sharp";

const MAX_FILES = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const COMPRESS_THRESHOLD_MB = 10;
const TARGET_MAX_MB = 9;
const MAX_DIMENSION = 2048;

export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 לא מוגדר. הוסף R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL ל-.env.local" },
      { status: 503 },
    );
  }

  const adminAuth = getAdminAuth();
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "חסר Authorization Bearer" }, { status: 401 });
  }

  let userId: string;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    userId = decoded.uid;
  } catch {
    return NextResponse.json({ error: "אימות נכשל" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "לא ניתן לקרוא את הבקשה" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "לא הועלו קבצים. שלח תמונות בשדה 'files'." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `מקסימום ${MAX_FILES} תמונות. העלית ${files.length}.` },
      { status: 400 },
    );
  }

  const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const basePath = `user-media/${userId}/${uploadId}`;
  const urls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    if (file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: `סרטונים לא נתמכים: ${file.name}. העלה/י תמונה בלבד.` },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `קובץ לא נתמך: ${file.name}. רק JPEG, PNG, WebP.` },
        { status: 400 },
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer()) as Buffer<ArrayBufferLike>;
    let outBuffer: Buffer<ArrayBufferLike> = inputBuffer;
    let outType = file.type;
    let outExt = file.name.split(".").pop()?.toLowerCase() || "jpg";

    // If the image is large, compress/resize to make uploads reliable.
    if (file.size > COMPRESS_THRESHOLD_MB * 1024 * 1024) {
      // Disable pixel limit to avoid rejecting high-res images.
      let img = sharp(inputBuffer, { limitInputPixels: false }).rotate();
      try {
        const meta = await img.metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          img = img.resize({
            width: w >= h ? MAX_DIMENSION : undefined,
            height: h > w ? MAX_DIMENSION : undefined,
            fit: "inside",
            withoutEnlargement: true,
          });
        }
      } catch {
        // If metadata fails, still attempt to encode.
      }

      // Encode as WebP and lower quality until it's reasonably small.
      outType = "image/webp";
      outExt = "webp";
      let quality = 86;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        outBuffer = (await img.webp({ quality }).toBuffer()) as Buffer<ArrayBufferLike>;
        if (outBuffer.length <= TARGET_MAX_MB * 1024 * 1024) break;
        quality -= 10;
        if (quality < 46) break;
      }
    }

    const safeName = `${i}.${outExt}`;
    const key = `${basePath}/${safeName}`;

    const publicUrl = await uploadToR2(key, outBuffer, outType);
    urls.push(publicUrl);
  }

  return NextResponse.json({ urls });
}
