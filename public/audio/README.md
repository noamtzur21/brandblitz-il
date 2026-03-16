# מחסן המוזיקה – Smart DJ

תיקיות לפי **Vibe** (אווירה):

- `energetic` – קצבי, אנרגטי
- `calm` – רגוע, Chill / Lo-fi
- `luxury` – יוקרתי, קולנועי
- `trendy` – טרנדי, ויראלי

ה־Worker בוחר קובץ MP3 אקראי מהתיקייה שמתאימה ל־`audioVibe` ב־Firestore (או אקראי אם חסר).

**למלא את המאגר:** הרץ פעם בחודש (או לפי צורך):

```bash
npm run fetch-music
```

דורש `PIXABAY_API_KEY` ב־`.env.local`. ראו [scripts/fetch-music.ts](../scripts/fetch-music.ts).
