import { NextResponse } from "next/server";

import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { geminiGenerateBrief } from "@/lib/vertex/gemini";
import { imagenGenerate } from "@/lib/vertex/imagen";
import { storeGeneratedAsset } from "@/lib/generatedAssetStore";

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }

  try {
    const brief = await geminiGenerateBrief({ niche: "סושי", type: "image" });
    const img = await imagenGenerate({ prompt: brief.prompt, aspectRatio: "9:16" });
    const url = await storeGeneratedAsset({
      kind: "images",
      genId: `smoke-${Date.now()}`,
      bytes: img.bytes,
      mimeType: img.mimeType,
    });

    return NextResponse.json({
      ok: true,
      imageUrl: url,
      overlayText: brief.overlayText,
      caption: brief.caption,
      prompt: brief.prompt,
      mimeType: img.mimeType,
      bytes: img.bytes.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Vertex smoke test failed" },
      { status: 500 },
    );
  }
}

