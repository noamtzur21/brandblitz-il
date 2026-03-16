# תמונה בלי טקסט – חובה לרמה מקצועית

הטקסט ה**מקצועי** שאנחנו רוצים שהצופה יקרא הוא **רק** ה־overlay ש־Remotion מרנדר מעל התמונה.  
טקסט שנוצר **בתוך** התמונה (על ידי Imagen/Gemini Image) יוצא מעוות ו"ג'יבריש" – וזה נראה כמו טעות של AI.

---

## מה לעשות ב־Make.com

### 1. הנחיית Gemini (מודול 3 – טקסט)

ב־**System Prompt** או בהוראת ה־JSON, חובה לכלול:

- השדה **prompt** (פרומפט לתמונה באנגלית) **חייב** לכלול במפורש:  
  **no text on image**, **no letters**, **negative space for overlay**.

**דוגמה להוספה להוראות:**

```
The "prompt" field must be an English description for image generation.
Always end the prompt with: "No text, no letters on the image. Negative space in the center for text overlay."
Or include in the middle: "clean background with no text, no writing, no letters."
```

### 2. לפני שליחה ל־Imagen (מודול התמונה)

אם יש מודול שמקבל את ה־prompt מ־Gemini ושולח ל־Imagen:

- **אופציה א':** וודא ש־Gemini כבר מחזיר prompt שמכיל את המשפטים האלו (לפי סעיף 1).
- **אופציה ב':** ב־Make, **הוסף (append)** לסוף ה־prompt לפני שליחה ל־Imagen:  
  ` No text, no letters, no text on image. Negative space for overlay.`

כך תקבל תמונה **נקייה** – והטקסט הויזואלי היחיד יהיה ה־overlay של Remotion (פונט עבה, צל, אנימציה).

---

## סיכום

| מקור הטקסט | מי יוצר | איכות | מה עושים |
|------------|---------|--------|----------|
| **בתמונה** | Imagen / מודל תמונה | גרוע (ג'יבריש) | **למנוע** – prompt עם "no text, no letters" |
| **מעל התמונה (Overlay)** | Gemini (overlayText) + Remotion | מקצועי | **להעצים** – פונט Heebo Black, צל, רקע דינמי, Safe zones |
