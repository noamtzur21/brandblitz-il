import "server-only";

type ResourceType = "image" | "video";

function getCloudName(): string {
  return process.env.CLOUDINARY_CLOUD_NAME || "dzxq3ym7t";
}

function getUploadPreset(): string {
  return process.env.CLOUDINARY_UPLOAD_PRESET || "my_unsigned_preset";
}

export async function uploadToCloudinaryUnsigned(opts: {
  bytes: Buffer;
  mimeType: string;
  resourceType: ResourceType;
  fileName?: string;
}): Promise<{ secureUrl: string }> {
  const cloudName = getCloudName();
  const preset = getUploadPreset();
  if (!cloudName || !preset) {
    throw new Error("Missing CLOUDINARY_CLOUD_NAME or CLOUDINARY_UPLOAD_PRESET.");
  }

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${opts.resourceType}/upload`;

  const fd = new FormData();
  const fileName =
    opts.fileName ||
    (opts.resourceType === "video" ? "asset.mp4" : "image.png");
  // Ensure the payload is typed as an ArrayBufferView<ArrayBuffer> for TS.
  const ab = opts.bytes.buffer.slice(
    opts.bytes.byteOffset,
    opts.bytes.byteOffset + opts.bytes.byteLength,
  ) as ArrayBuffer;
  fd.append("file", new Blob([ab], { type: opts.mimeType }), fileName);
  fd.append("upload_preset", preset);

  const res = await fetch(url, { method: "POST", body: fd });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = json?.error?.message || `Cloudinary upload failed (${res.status})`;
    throw new Error(msg);
  }
  const secureUrl = json?.secure_url;
  if (!secureUrl) throw new Error("Cloudinary did not return secure_url.");
  return { secureUrl: String(secureUrl) };
}

