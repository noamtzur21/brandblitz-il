import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

const ADD_AMOUNT = 10;

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}

/** זמני לבדיקות: מוסיף 10 קרדיטים למשתמש. להפעלה: ALLOW_TEST_CREDITS=true ב-.env.local */
export async function POST(req: Request) {
  if (process.env.ALLOW_TEST_CREDITS !== "true") {
    return NextResponse.json(
      { error: "הוספת קרדיטים לבדיקות לא מופעלת (ALLOW_TEST_CREDITS)" },
      { status: 403 },
    );
  }

  let userId: string | null = null;
  try {
    userId = await getUserIdFromRequest(req);
  } catch {
    return NextResponse.json({ error: "אימות נכשל" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ error: "חסר Authorization Bearer" }, { status: 401 });
  }

  const adminDb = getAdminDb();
  const creditsRef = adminDb.doc(`users/${userId}/credits/summary`);

  try {
    const snap = await creditsRef.get();
    const current =
      snap.exists && typeof snap.get("balance") === "number" ? (snap.get("balance") as number) : 0;
    const newBalance = current + ADD_AMOUNT;
    await creditsRef.set({ balance: newBalance, updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true, added: ADD_AMOUNT, balance: newBalance });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שגיאה בעדכון קרדיטים" },
      { status: 500 },
    );
  }
}
