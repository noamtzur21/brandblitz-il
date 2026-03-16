/**
 * Smart DJ – Cloud-only (no local files).
 *
 * המערכת עברה ל־100% ענן:
 * - **מוזיקה:** ה־Worker מקבל טראקים ישירות מ־Jamendo API לפי audioVibe (אין תיקיות מקומיות).
 * - **SFX:** ה־Worker מקבל sfxUrl מה־HTTP Request (Make callback). Make שולח קישור ל־SFX (למשל מ־Mixkit או מודול 5).
 *
 * הסקריפט הזה לא כותב יותר לתיקיות. הוא מדפיס ל־stdout רשימת קישורי SFX מומלצים
 * שאפשר להעביר ל־Make (מודול 5) או לשמור כ־default ב־callback.
 *
 * הרצה: npm run music:refresh (או fetch-music)
 * env: אין חובה – רק אם רוצים לבדוק Jamendo: JAMENDO_CLIENT_ID
 */
import "./load-env";

/** SFX URL that allows streaming (no 403). Use this in Make.com as sfxUrl. Mixkit often blocks bots. */
const RECOMMENDED_SFX_URL = "https://raw.githubusercontent.com/the-noam/assets/main/pop.mp3";

const DEFAULT_SFX_URLS = [
  RECOMMENDED_SFX_URL,
  "https://cdn.mixkit.co/audio/sfx/2560-mixkit-pop-click-2360.mp3",
  "https://cdn.mixkit.co/audio/sfx/2568-mixkit-swoosh-2368.mp3",
];

async function main() {
  console.log("Smart DJ – Cloud-only mode (no local files).\n");
  console.log("Music: Worker uses JAMENDO_CLIENT_ID and fetches tracks by audioVibe from Jamendo API.");
  console.log("SFX: Send sfxUrl in the Make callback body (e.g. from module 5).");
  console.log("Recommended (no 403):", RECOMMENDED_SFX_URL);
  console.log("\nUse this in Make module 5 as sfxUrl. Mixkit links often return 403 for bots.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
