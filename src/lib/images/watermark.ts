import "server-only";

import sharp from "sharp";

async function fetchBytes(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const mimeType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mimeType };
}

export async function watermarkImageWithLogo(opts: {
  imageBytes: Buffer;
  logoUrl: string;
  /** Width factor of the base image. Default 0.1 (10%). */
  logoWidthRatio?: number;
  /** Padding factor of the base image. Default 0.04 (4%). */
  paddingRatio?: number;
}): Promise<Buffer> {
  const { imageBytes, logoUrl } = opts;
  const { bytes: logoBytes } = await fetchBytes(logoUrl);

  const base = sharp(imageBytes);
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return imageBytes;

  const logoWidth = Math.max(40, Math.round(width * (opts.logoWidthRatio ?? 0.1)));
  const padding = Math.max(10, Math.round(width * (opts.paddingRatio ?? 0.04)));

  const logoPng = await sharp(logoBytes)
    .resize({ width: logoWidth, withoutEnlargement: true })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logoPng).metadata();
  const lw = logoMeta.width ?? logoWidth;
  const lh = logoMeta.height ?? logoWidth;

  const left = Math.max(0, width - lw - padding);
  const top = Math.max(0, height - lh - padding);

  // Keep output as PNG to preserve transparency/quality.
  return await sharp(imageBytes).composite([{ input: logoPng, left, top }]).png().toBuffer();
}

export async function toShareJpeg(opts: {
  imageBytes: Buffer;
  logoUrl?: string | null;
}): Promise<Buffer> {
  const base = sharp(opts.imageBytes);
  let out = base;
  if (opts.logoUrl) {
    try {
      const wm = await watermarkImageWithLogo({ imageBytes: opts.imageBytes, logoUrl: opts.logoUrl });
      out = sharp(wm);
    } catch {
      out = base;
    }
  }
  return await out.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

