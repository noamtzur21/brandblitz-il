# Smart DJ – 100% Cloud (ללא קבצים מקומיים)

המערכת **לא** משתמשת יותר בתיקיות מקומיות. מוזיקה ו־SFX מגיעים מהענן.

---

## מה בנוי

1. **Callback API:** מקבל מ־Make: `audioVibe`, `sfxUrl` (אופציונלי), `overlayText`, `resultUrl` וכו', ושומר ב־Firestore.
2. **מוזיקה:** ה־Worker קורא ל־**Jamendo API** עם `JAMENDO_CLIENT_ID` ובוחר טראק אקראי לפי **audioVibe** (energetic | calm | luxury | trendy). מעביר ל־Remotion: `musicUrl`, `musicStartFromFrame`, `playbackRate`.
3. **SFX:** ה־Worker מקבל **sfxUrl** מהמסמך (מה־callback). Make שולח ב־Body קישור ל־SFX (למשל ממודול 5). ה־SFX מתנגן ב־Remotion **בדיוק בפריים** שבו מופיעה המילה המודגשת (*כוכביות*).
4. **Remotion:** מנגן מוזיקה (אם יש) ו־SFX (אם יש). אם קישור חסר או לא תקין – הרינדור ממשיך בלי סאונד, בלי קריסה.
5. **סקריפט music:refresh:** לא כותב יותר לתיקיות. מדפיס קישורי SFX מומלצים ל־Make.

---

## חיבור Make.com – Gemini כ־"DJ"

ב־**מודול Gemini** (ה־System Prompt או ההוראה ל־JSON), הוסף:

- **פלט JSON:** שדה **audioVibe** עם אחד הערכים: `energetic`, `calm`, `luxury`, `trendy`, בהתאם לאווירה של התוכן.

**דוגמת הוראה:**

```
בנוסף ל־caption, overlayText ו־prompt, הוסף שדה JSON:
"audioVibe": אחד מהערכים: "energetic", "calm", "luxury", "trendy"
בהתאם לאווירה של התוכן שיצרת (קצבי/רגוע/יוקרתי/טרנדי).
```

ב־**HTTP Callback** (בענף Remotion) הוסף ל־Body:

- `audioVibe`: למפות מהפלט של Gemini (למשל `3. audioVibe`).

ה־API כבר מקבל ושומר את השדה.

---

## הגדרה (Cloud-only)

- **מוזיקה:** הגדר `JAMENDO_CLIENT_ID` ב־env של ה־Worker (מ־[devportal.jamendo.com](https://devportal.jamendo.com)). ה־Worker יבחר טראק אקראי לפי audioVibe. אם המפתח חסר או ה־API נכשל – הרינדור ממשיך בלי מוזיקה.
- **SFX (חבילה מקומית):** ה־Worker משתמש קודם ב־**Social SFX Pack - Collection 1** ב־`public/`: **Whooshs** + **Risers** להוק (פריים 0), **Impacts** + **Drops** להופעת המילה המודגשת. אם אין קבצים – משתמש ב־sfxUrl מ־Make (אופציונלי). וודא ש־**APP_URL** מצביע לאתר שבו ה־public נגיש.
  - **חשוב:** שם התיקייה חייב להיות בדיוק: `public/Social SFX Pack - Collection 1/` (עם רווחים והמקף).
  - **הרצת ה־Worker:** להריץ **משורש הפרויקט** (`brandblitz-il`), לא מתוך תיקיית `scripts/`. לדוגמה: `cd brandblitz-il && npm run worker:remotion`. אם תריץ מתוך `scripts/`, ה־Worker לא ימצא את תיקיית ה־public.
- **חסינות:** קישור שבור או חסר → הסרטון מתרנדר כרגיל, בלי סאונד, בלי קריסה.

---

## Worker

ה־Worker **לא** קורא לתיקיות מקומיות. הוא מקבל מוזיקה מ־Jamendo API (לפי audioVibe) ו־sfxUrl מהמסמך ב־Firestore (שהגיע מה־callback). וודא ש־`JAMENDO_CLIENT_ID` מוגדר ב־env של ה־Worker.
