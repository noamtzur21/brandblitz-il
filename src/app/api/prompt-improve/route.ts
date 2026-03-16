import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { getAccessToken, getVertexLocation, getVertexProjectId } from "@/lib/vertex/auth";

type GeminiTextPart = { text?: string };
type GeminiCandidate = { content?: { parts?: GeminiTextPart[] } };
type GeminiError = { message?: string };
type GeminiResponse = { candidates?: GeminiCandidate[]; error?: GeminiError };

type Body = {
  text?: string;
  niche?: string;
  type?: "image" | "remotion" | "premium";
};

function normalizeImprovedText(raw: string) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksTruncatedOrTooShort(s: string) {
  const t = s.trim();
  if (t.length < 60) return true;

  // Detect obvious truncation: ends with a single-letter word or a dangling Hebrew letter.
  const lastToken = t.split(/\s+/).filter(Boolean).slice(-1)[0] ?? "";
  if (lastToken.length <= 1 && /[א-ת]/.test(lastToken)) return true;

  // Ends mid-sentence without punctuation is often a cutoff.
  if (!/[.!?…]$/.test(t) && t.length < 260) return true;

  return false;
}

function endpoint(modelId: string) {
  const project = getVertexProjectId();
  const loc = getVertexLocation();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/publishers/google/models/${modelId}:generateContent`;
}

async function verifyUserIdFromAuthHeader(req: Request): Promise<string> {
  const h = req.headers.get("authorization") || "";
  const match = h.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Missing Authorization Bearer token");
  const decoded = await getAdminAuth().verifyIdToken(match[1]!);
  return decoded.uid;
}

async function callGeminiText(opts: {
  token: string;
  systemInstruction: string;
  userText: string;
  maxOutputTokens: number;
}) {
  const payload = {
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: opts.userText }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: opts.maxOutputTokens,
      responseMimeType: "text/plain",
    },
  };

  const res = await fetch(endpoint("gemini-2.5-flash"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!res.ok) {
    const msg = json?.error?.message || `Prompt improve failed (${res.status})`;
    throw new Error(msg);
  }

  const out =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("") ??
    "";
  return normalizeImprovedText(out);
}

export async function POST(req: Request) {
  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  try {
    // Prevent abuse: require an authenticated user.
    await verifyUserIdFromAuthHeader(req);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "אימות נכשל" },
      { status: 401 },
    );
  }

  const text = (body?.text ?? "").trim();
  const niche = (body?.niche ?? "").trim();
  const type = body?.type ?? "image";
  if (!text) return NextResponse.json({ error: "חסר טקסט" }, { status: 400 });

  const baseInstruction = `You rewrite Hebrew requests into a stronger creative brief for a social media content generator.

Rules:
- Output Hebrew ONLY.
- Output plain text ONLY (no JSON, no markdown, no bullets).
- Return 3-6 short sentences (not less).
- Make it specific, actionable, and high quality. No half-words, no cut-off output.
- Include: business type, target audience, core promise/benefit, concrete offer or angle, visual direction, mood, and a clear CTA.
- Stay strictly aligned to the input. Do not invent an unrelated domain (e.g. legal) unless the input clearly indicates it.
- Never mention AI, models, or tools.`;

  const userText = [
    niche ? `תחום העסק: ${niche}` : null,
    `סוג תוכן: ${type}`,
    `בקשת משתמש: ${text}`,
  ]
    .filter(Boolean)
    .join("\n");

  const token = await getAccessToken();
  let improved = "";
  try {
    // First attempt (allow a lot of tokens so it won't cut mid-word).
    improved = await callGeminiText({
      token,
      systemInstruction: baseInstruction,
      userText,
      maxOutputTokens: 1800,
    });

    // If Gemini still cuts off, ask it to CONTINUE from where it stopped and stitch.
    for (let i = 0; i < 3 && looksTruncatedOrTooShort(improved); i++) {
      const continuation = await callGeminiText({
        token,
        systemInstruction:
          "You are continuing a Hebrew text. Output Hebrew ONLY. Output plain text ONLY. " +
          "Continue EXACTLY from where the previous text ended. Do not repeat the beginning. " +
          "Finish the thought with a clear CTA sentence and end with punctuation.",
        userText: `טקסט קיים:\n${improved}\n\nהמשך מכאן:`,
        maxOutputTokens: 900,
      });

      // If continuation somehow repeats, still append (client-side text is what user sees).
      improved = normalizeImprovedText(`${improved} ${continuation}`);
      if (improved.length > 3500) break;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שגיאה" }, { status: 500 });
  }

  if (!improved) return NextResponse.json({ error: "לא התקבל טקסט משופר" }, { status: 500 });
  if (looksTruncatedOrTooShort(improved)) {
    return NextResponse.json({
      improved,
      warning: "ג׳מיני החזיר טקסט קצר יחסית. אם תרצה תוצאה יותר מדויקת, הוסף פרטים (מבצע, קהל יעד, אזור, CTA).",
    });
  }
  return NextResponse.json({ improved });
}

