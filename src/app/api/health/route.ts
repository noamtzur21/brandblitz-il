import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase/admin";
import { isR2Configured } from "@/lib/r2";
import { getAccessToken, getVertexLocation, getVertexProjectId } from "@/lib/vertex/auth";

type HealthOut = {
  ok: boolean;
  time: string;
  r2Configured: boolean;
  vertex: {
    projectId: string | null;
    location: string;
    accessTokenOk: boolean;
    error?: string;
  };
  firebaseAdminOk: boolean;
  firebaseAdminError?: string;
};

export async function GET() {
  const out: HealthOut = {
    ok: true,
    time: new Date().toISOString(),
    r2Configured: isR2Configured(),
    vertex: {
      projectId: null as string | null,
      location: getVertexLocation(),
      accessTokenOk: false,
    },
    firebaseAdminOk: false,
  };

  try {
    getAdminDb();
    out.firebaseAdminOk = true;
  } catch (e) {
    out.ok = false;
    out.firebaseAdminError = e instanceof Error ? e.message : "firebase admin init failed";
  }

  try {
    out.vertex.projectId = getVertexProjectId();
    await getAccessToken();
    out.vertex.accessTokenOk = true;
  } catch (e) {
    out.ok = false;
    out.vertex.error = e instanceof Error ? e.message : "vertex auth failed";
  }

  return NextResponse.json(out, { status: out.ok ? 200 : 500 });
}

