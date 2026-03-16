# Pixabay – endpoint למוזיקה (Smart DJ)

## מצב התיעוד

בדף התיעוד הרשמי **[pixabay.com/api/docs](https://pixabay.com/api/docs/)** מופיעים בפירוש רק שני endpoints:

- **תמונות:** `GET https://pixabay.com/api/`
- **וידאו:** `GET https://pixabay.com/api/videos/`

**אין בתיעוד הציבורי endpoint למוזיקה/אודיו.**  
באתר יש [Music](https://pixabay.com/music/) ו-[Sound Effects](https://pixabay.com/sound-effects/), אבל לא ברור אם יש להם API נפרד ומתועד.

---

## מה לעשות

1. **מפתח API – רק ב־env**  
   אל תדביק את המפתח האישי שלך בקוד או ב־README.  
   השתמש **רק** ב־`PIXABAY_API_KEY` ב־`.env.local` (והקובץ לא נשמר ב־git).

2. **למצוא את ה־endpoint למוזיקה (אם קיים)**  
   - היכנס ל־[pixabay.com/api/docs](https://pixabay.com/api/docs/) **מחובר לחשבון**.  
   - בדוק אם יש סעיף "Search music" / "Search audio" עם כתובת כמו  
     `https://pixabay.com/api/audio/` או `https://pixabay.com/api/music/`.  
   - אם מצאת URL אחר – עדכן את הסקריפט או את משתנה הסביבה (ראו למטה).

3. **הגדרת endpoint מותאם (אם צריך)**  
   אם ה־URL למוזיקה שונה מ־`https://pixabay.com/api/audio/`, הוסף ב־`.env.local`:

   ```env
   PIXABAY_MUSIC_API_URL="https://pixabay.com/api/...."
   ```

   הסקריפט `scripts/fetch-music.ts` משתמש ב־`PIXABAY_MUSIC_API_URL` אם הוא מוגדר.

4. **אם אין API למוזיקה**  
   אפשר למלא את התיקיות ידנית: להעלות קבצי MP3 ל־  
   `public/audio/energetic`, `calm`, `luxury`, `trendy`.  
   ה־Worker יבחר מהם קובץ אקראי לפי `audioVibe`.

---

## סיכום

- **מפתח:** רק `PIXABAY_API_KEY` ב־.env, לא בקוד.  
- **Endpoint למוזיקה:** לא מתועד בבירור; לבדוק בדף הדוקומנטציה כשמחוברים ולהוסיף `PIXABAY_MUSIC_API_URL` אם ה־URL שונה.
