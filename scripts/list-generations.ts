/**
 * רשימת generations מ-Firestore (Admin SDK – עוקף Rules).
 * שימוש: npx tsx scripts/list-generations.ts
 * דורש FIREBASE_ADMIN_* ב-.env.local
 */
import "./load-env";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
  console.error("Missing FIREBASE_ADMIN_* in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }),
  });
}

const db = getFirestore();

async function main() {
  const snap = await db.collection("generations").orderBy("createdAt", "desc").limit(20).get();
  console.log(`generations (אחרונים ${snap.size}):\n`);
  snap.docs.forEach((d) => {
    const x = d.data();
    console.log(
      [
        d.id,
        x.status,
        x.type,
        x.niche,
        x.resultUrl ? "✓ url" : "-",
        new Date((x.createdAt as number) || 0).toISOString(),
      ].join("  |  "),
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
