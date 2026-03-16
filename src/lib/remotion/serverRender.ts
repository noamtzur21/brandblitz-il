import "server-only";

import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

type RenderInput = {
  imageUrl: string;
  text: string;
};

let cachedServeUrlPromise: Promise<string> | null = null;

async function getServeUrl() {
  if (cachedServeUrlPromise) return cachedServeUrlPromise;
  cachedServeUrlPromise = bundle({
    entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    webpackOverride: (config) => config,
  });
  return cachedServeUrlPromise;
}

export async function renderBrandBlitzVerticalMp4(input: RenderInput) {
  const serveUrl = await getServeUrl();
  const compositionId = "BrandBlitzVertical";

  const comp = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps: input,
  });

  const outPath = path.join(os.tmpdir(), `brandblitz-${Date.now()}.mp4`);
  await renderMedia({
    serveUrl,
    composition: comp,
    codec: "h264",
    outputLocation: outPath,
    inputProps: input,
  });

  const buf = await fs.readFile(outPath);
  await fs.unlink(outPath).catch(() => {});
  return buf;
}

