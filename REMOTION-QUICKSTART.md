# Remotion – הפעלת הווידאו (תמונה → MP4 → R2)

## זרימה

1. משתמש בוחר **סוג: רמושן** ב־/generate.
2. Make מחזיר תמונה + טקסט → callback מעדכן: `status: "rendering"`, `sourceImageUrl`, `overlayText`, `caption`.
3. **Worker** (מקומי או על שרת) עושה poll ל־Firestore, מרנדר MP4 (Ken Burns + טקסט), מעלה ל־R2, מעדכן ל־`status: "done"` + `resultUrl`.

## דרישות

- **Firebase Admin** ב־`.env`: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`.
- **R2** ב־`.env`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` (בסיס ה־URL הציבורי של ה־bucket, בלי סלאש בסוף).

## אינדקס Firestore

השאילתה של ה־worker: `type == "remotion"`, `status == "rendering"`, ממוין לפי `createdAt`.  
האינדקס כבר ב־`firestore.indexes.json`. אם עדיין לא deploy:

```bash
firebase deploy --only firestore:indexes
```

## הרצת ה־Worker

```bash
npm run worker:remotion
```

ה־worker רץ בלולאה, בודק כל ~4 שניות. להשאיר פתוח (או להריץ כ־systemd/supervisor בפרודקשן).

## בדיקה

1. ב־Make: אותו תרחיש – אין צורך בענף נפרד ל־remotion; Callback מקבל `resultUrl` (תמונה) ו־`overlayText`. אם `type === "remotion"` (נשלח מה־Webhook), ה־callback מגדיר `rendering` + `sourceImageUrl`.
2. וודא ש־Webhook שולח **type** כמו שהמשתמש בחר (`"image"` / `"remotion"`).
3. אחרי ש־Make מסיים → ב־Firestore ה־doc יעבור ל־`rendering` → ה־worker יבצע render ויעדכן ל־`done` עם `resultUrl` (וידאו מ־R2).
