# Remotion – רודמאפ לעריכה יצירתית

התשתית: תמונה מ־AI + טקסט מ־Gemini → Remotion מרנדר MP4 עם אנימציה **רב־שכבתית** (קומפוזיציה בסגנון After Effects).

---

## מה יש עכשיו

- **3 סגנונות ויזואליים** (default, pop, dramatic) – זום, ויגנט, וקצב כניסת טקסט שונים.
- **שכבות אפקטים (Overlays):**
  - **Light Leaks** – הבזקי אור צבעוניים שנעים בפינות (`overlays/LightLeaksOverlay.tsx`).
  - **Particles** – חלקיקי אור שצפים (`overlays/ParticlesOverlay.tsx`).
  - **Film Grain** – טקסטורת פילם (SVG feTurbulence) (`overlays/FilmGrainOverlay.tsx`).
  - **Dramatic Overlay** – ויגנט + טשטוש קצוות (`overlays/DramaticOverlay.tsx`).
- **טיפוגרפיה ברמת Motion Graphics:**
  - **Spring** (Remotion `spring()`) – אנימציה אלסטית לטקסט.
  - **מילה־מילה** – כל מילה נכנסת עם stagger ו־spring.
  - **Motion blur** – טשטוש קל בזמן התנועה (`AnimatedText.tsx`).
- **אודיו (אופציונלי):**
  - **musicUrl** – מוזיקת רקע (למשל לפי videoStyle).
  - **sfxUrl** – SFX (whoosh/pop) ב־`Sequence` בפריים של כניסת הטקסט.
  - אם לא מעבירים – לא מושמע כלום.
- **Worker:** מעביר `videoStyle` (ואפשר בעתיד `musicUrl`/`sfxUrl` מ־Firestore). אם אין `videoStyle` – בוחר אקראי.

---

## שלב הבא: Gemini כ־"במאי"

כדי שהעריכה תהיה **יצירתית לפי התוכן** (ולא רק אקראית):

1. **ב־Make (Gemini):** להרחיב את פלט ה־JSON לשדה נוסף, למשל:
   - `videoStyle`: `"default"` | `"pop"` | `"dramatic"` (לפי אווירה: רגוע/קצבי/דרמטי).
   - או `mood`: טקסט חופשי ש־Make מעביר ל־callback.
2. **ב־Callback:** ב־Body של ה־HTTP Callback (בענף Remotion) להוסיף שדה `videoStyle` ולמפות מהפלט של Gemini. ה־API `make-callback` כבר מקבל `videoStyle` ושומר ב־Firestore.
3. **Worker:** קורא `data.videoStyle` – אם קיים וערך תקף, משתמש בו; אחרת בוחר אקראי.

---

## רשימת רעיונות להמשך (עריכה "מטורפת")

- **שכבות ואפקטים:** Particles, Light Leaks, Lens Flare (CSS/Canvas או ספריות).
- **טיפוגרפיה דינמית:** טקסט מילה־מילה, פונטים/צבעים שמתחלפים לפי הקצב.
- **מעברים:** אם יש כמה תמונות – גליץ', פלאש, wipe.
- **סטיקרים/באדג'ים:** "מבצע", "SALE" עם אנימציית קפיץ.
- **מאגר סגנונות מורחב:** יותר מ־3 (retro, luxury, minimal, neon וכו') – בחירה אקראית או לפי `videoStyle`/`mood` מ־Gemini.
- **אודיו:** כבר נתמך – להעביר `musicUrl` ו־`sfxUrl` ב־inputProps (למשל מקבצים ב־`public/` עם `staticFile()`, או מ־Firestore כשמוסיפים שדות). כרגע ה־worker לא מעביר; אפשר להרחיב ל־generations.videoStyle → mapping ל־URLs.

כל אלה מתממשים ב־`remotion/scenes/` – תבנית אחת משרתת את כל היצירות.
