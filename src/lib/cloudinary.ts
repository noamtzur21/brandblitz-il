function isCloudinaryAssetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "res.cloudinary.com" && u.pathname.includes("/upload/");
  } catch {
    return false;
  }
}

function toCloudinaryFetchLayer(logoUrl: string): string {
  // Cloudinary expects base64 of the remote URL for l_fetch overlays.
  // Use URL-safe base64 (Cloudinary convention): + -> -, / -> _, strip =
  const b64 = Buffer.from(logoUrl).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `l_fetch:${b64}`;
}

/**
 * Build a transformed Cloudinary URL that overlays the given remote logo.
 * Works only when the videoUrl is already a Cloudinary URL.
 *
 * Notes:
 * - Assumes logo is transparent PNG/WebP for best results (otherwise it will appear as a sticker).
 * - Background removal requires a paid Cloudinary add-on; we don't apply it here by default.
 */
export function buildCloudinaryWatermarkedVideoUrl(opts: {
  videoUrl: string;
  logoUrl: string;
  /** 0..1 relative width of video (Cloudinary supports w_0.xx). Default: 0.18 */
  relativeWidth?: number;
  /** Margin in px. Default: 24 */
  marginPx?: number;
  /** Corner. Default: north_east */
  gravity?: "north_east" | "north_west" | "south_east" | "south_west";
  /**
   * Heuristic "remove white background" for simple logos (often free).
   * Cloudinary effect: e_make_transparent (tolerance 0..100-ish). Default: 10.
   */
  makeTransparentTolerance?: number;
}): string | null {
  const { videoUrl, logoUrl } = opts;
  if (!videoUrl || !logoUrl) return null;
  if (!isCloudinaryAssetUrl(videoUrl)) return null;

  const relativeWidth = typeof opts.relativeWidth === "number" ? opts.relativeWidth : 0.18;
  const marginPx = typeof opts.marginPx === "number" ? Math.max(0, Math.floor(opts.marginPx)) : 24;
  const gravity = opts.gravity ?? "north_east";

  // Insert transformations right after /upload/
  // Example:
  // https://res.cloudinary.com/<cloud>/video/upload/<TRANSFORMS>/<publicId>.mp4
  const marker = "/upload/";
  const idx = videoUrl.indexOf(marker);
  if (idx === -1) return null;

  const prefix = videoUrl.slice(0, idx + marker.length);
  const suffix = videoUrl.slice(idx + marker.length);

  const layer = toCloudinaryFetchLayer(logoUrl);
  const w = Math.min(0.6, Math.max(0.06, relativeWidth)).toFixed(2);
  const tol =
    typeof opts.makeTransparentTolerance === "number"
      ? Math.max(0, Math.min(100, Math.floor(opts.makeTransparentTolerance)))
      : 10;
  const transform = [
    `${layer}`,
    // "Gold tip": makes the dominant (often white) background transparent for simple logos.
    `e_make_transparent:${tol}`,
    `w_${w}`,
    `g_${gravity}`,
    `x_${marginPx}`,
    `y_${marginPx}`,
    "fl_relative",
    "fl_layer_apply",
  ].join(",");

  return `${prefix}${transform}/${suffix}`;
}

