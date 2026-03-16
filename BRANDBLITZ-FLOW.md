# BrandBlitz IL – מסלול המידע (סדר מוחלט)

כדי לא ללכת לאיבוד במודולים – זה המסלול מקצה לקצה.

---

## תחנה 1: האתר (Next.js)

משתמש בוחר נישה → לוחץ "צור עכשיו".

- **בדיקה:** יש מספיק קרדיטים?
- **רישום:** נוצר "כרטיס עבודה" ב־Firestore (`generations/{genId}`), סטטוס `processing`.
- **הרצת AI (בשרת):** קריאה ל־Vertex AI:
  - **Gemini 2.5 Flash** → מחזיר `caption`, `overlayText`, ו־`prompt` (באנגלית לתמונה).
  - **Imagen 4 (Nano Banana)** → מייצר תמונת רקע (בלי טקסט).
  - שמירה ל־**R2** → `resultUrl` / `sourceImageUrl`.

---

## תחנה 2: Workers (Remotion / Veo)

חלק מהיצירות הן אסינכרוניות:

| מסלול | מי מטפל | מה קורה |
|------|---------|---------|
| `image` | השרת | מייצר תמונה (Gemini → Imagen) ושומר ל־R2 |
| `remotion` | השרת + Remotion worker | השרת מייצר תמונה ושומר ל־R2 → `pending_review` → המשתמש מאשר → `rendering` → ה־worker מרנדר MP4 ומעלה ל־R2 |
| `premium` | Veo worker | השרת יוצר `videoPrompt` ושומר במסמך → ה־worker קורא ל־Veo 3.1, מעלה וידאו ל־R2, ומעדכן ל־`done` |

**למה צריך LLM (Gemini)?**  
הוא קובע מה יהיה בפוסט (קופי + כותרת) ואיך התמונה תתואר (פרומפט באנגלית ל־Imagen 3).

---

## תחנה 3: עדכון Firestore

אין Make ואין callback. העדכון מתבצע ישירות ע״י השרת/ה־workers בכתיבה ל־Firestore:

- `processing` → `done` (תמונה מוכנה)
- `pending_review` → `rendering` → `done` (Remotion)
- `processing` → `done` (Premium / Veo)

---

## תחנה 4: האתר מעדכן את המשתמש

- האתר קורא Firestore ב־Realtime ומציג סטטוס.
- **Remotion (העורך)** – מוסיף עברית ואנימציות (לסוג remotion).
- המשתמש רואה בדף עדכון live → תמונה/וידאו מוכן + הורדה.

---

## איפה אנחנו עכשיו

הזרימה רצה בקוד (ללא Make).  
במקומי: `npm run dev` + `npm run worker:remotion` + `npm run worker:veo`.
