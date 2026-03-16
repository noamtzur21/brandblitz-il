# פריסה לפרודקשן (Production)

מדריך קצר להעלאת BrandBlitz IL לסביבת production (למשל Vercel).

---

## 2. משתני סביבה (Vercel)

ב־Vercel → Project → Settings → Environment Variables הוסף את כל הערכים מ־`.env.local` (ללא ערכי dev):

| משתנה | חובה | הערה |
|--------|------|------|
| `NEXT_PUBLIC_FIREBASE_*` | כן | אותם ערכים כמו ב־dev |
| `FIREBASE_ADMIN_PROJECT_ID` | כן | לאשראות ולקריאות Firestore |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | כן | |
| `FIREBASE_ADMIN_PRIVATE_KEY` | כן | העתק את ה־private key (עם \n כ־\\n אם נדרש) |
| `VERTEX_PROJECT_ID` | אופציונלי | אם רוצים ש-Vertex ירוץ על פרויקט GCP נפרד מ-Firebase |
| `VERTEX_CLIENT_EMAIL` | אופציונלי | Service Account ל-Vertex (אם נפרד) |
| `VERTEX_PRIVATE_KEY` | אופציונלי | Private key ל-Vertex (אם נפרד, עם \\n) |
| `VERTEX_LOCATION` | אופציונלי | ברירת מחדל: `europe-west1` |

**R2** (תמונות+וידאו, וגם Workers – לא על Vercel):

- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`  
- ה־workers (`npm run worker:remotion`, `npm run worker:veo`) רצים על מכונה/שרת נפרד (לא כחלק מ־Next.js ב־Vercel).

---

## 4. Firebase

- **Firestore Rules:** וודא שהכללים מתאימים ל־production (גישה ל־generations, users לפי uid).
- **Auth:** אם משתמשים ב־Anonymous או Google – הגדרות ה־domain ב־Firebase Console (Authorized domains) צריכות לכלול את הדומיין של Vercel.

---

## 5. Worker Remotion (אופציונלי)

- ה־worker לא רץ על Vercel. להריץ על שרת (VPS, Railway, וכו') או מקומית בזמן פיתוח.
- על השרת: `.env` עם Firebase Admin + R2; `npm run worker:remotion`.
- אינדקס Firestore: `firebase deploy --only firestore:indexes` (פעם אחת).

---

## 6. צ'קליסט לפני עלייה

- [ ] כל משתני Firebase (client + admin) מוגדרים ב־Vercel.
- [ ] Vertex AI API מופעל בפרויקט הרלוונטי (Billing + `aiplatform.googleapis.com` + הרשאות ל-Service Account).
- [ ] Firestore indexes deployed אם משתמשים ב־Remotion.
- [ ] דומיין מורשה ב־Firebase Auth (אם רלוונטי).
