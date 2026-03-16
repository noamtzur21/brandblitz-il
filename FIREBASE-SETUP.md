# הגדרת Firebase – BrandBlitz IL

מדריך צעד־אחר־צעד לסיום כל צד Firebase בפרויקט.

---

## מה נשאר (צ'קליסט)

| שלב | סטטוס | איפה במדריך |
|-----|--------|-------------|
| **1. Authentication** (Anonymous) | ✅ עשית | סעיף 2 – Authentication |
| **2. Firestore Database** | ⬜ ליצור DB + להעלות Rules ו־Indexes | סעיפים 2 (Firestore), 5 (Rules) |
| **3. Client config** (ל־.env.local) | ✅ אם כבר הוספת אפליקציית Web | סעיף 3 |
| **4. Service Account** (Admin) | ⬜ ל־/api/generate (חיוב קרדיטים) | סעיף 4 |
| **5. Firebase Storage** | ❌ **לא צריך** – וידאו נשמר ב־R2 | ראה למטה "למה אין לנו Firebase Storage" |

**לסיכום:** נשאר לך **Firestore** (חובה) ו־**Service Account** (כדי שיצירת תוכן "חיה" תעבוד מהאפליקציה).

---

## למה אין לנו Firebase Storage?

באתר שלנו **לא** מעלים קבצים של משתמשים (לוגו מגיע כ־URL חיצוני).  
**Storage** נחוץ רק בשביל **קובץ אחד:** הווידאו ש־Remotion מייצר (MP4). את זה אנחנו שומרים ב־**Cloudflare R2** – זול יותר ו־אפס egress.  
לכן **אין צורך** להפעיל Firebase Storage.

---

## 1. יצירת פרויקט Firebase

1. היכנס ל־[Firebase Console](https://console.firebase.google.com/).
2. **Create a project** (או בחר פרויקט קיים).
3. תן שם (למשל `brandblitz-il`), אפשר לכבות Analytics אם לא צריך.
4. **Create project** ולחץ **Continue**.

---

## 2. הפעלת שירותים

### Authentication
1. בתפריט: **Build → Authentication**.
2. **Get started**.
3. ב־**Sign-in method** הפעל **Anonymous** (Enable → Save).

### Firestore Database
1. **Build → Firestore Database**.
2. **Create database**.
3. בחר **Start in test mode** (לפיתוח) או **Production mode** – אחרי שתעלה את ה־Rules מהפרויקט אפשר לעבור ל־Production.
4. בחר מיקום (למשל `europe-west1`).
5. **Enable**.

### Storage – לא מפעילים
- וידאו Remotion נשמר ב־**R2** ([R2-SETUP.md](./R2-SETUP.md)). לא צריך Firebase Storage.

---

## 3. קבלת הגדרות Client (ל־.env.local)

1. **Project settings** (גלגל השיניים ליד **Project Overview**).
2. בגלילה: **Your apps** → **Add app** → **Web** (איקון `</>`).
3. כינוי אפליקציה (למשל `brandblitz-web`) → **Register app**.
4. העתק את אובייקט `firebaseConfig` והשווה לשמות ב־`.env.local`:

| משתנה ב־.env.local | מאיפה לוקחים |
|---------------------|----------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

5. צור קובץ `.env.local` בשורש הפרויקט (אם עדיין אין) והדבק את הערכים. אפשר להתחיל מהקובץ `.env.local.example`.

---

## 4. Service Account (ל־Admin SDK – API מהשרת)

1. **Project settings** → **Service accounts**.
2. **Generate new private key** → **Generate key** (יורד קובץ JSON).
3. **אל תעלה/תשתף את הקובץ.** פתח אותו וקח:
   - `project_id` → `FIREBASE_ADMIN_PROJECT_ID`
   - `client_email` → `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_ADMIN_PRIVATE_KEY`  
     (בקובץ זה מחרוזת עם `\n`. ב־.env.local אפשר להשאיר עם `\n` או להמיר ל־`\\n` אם המפרש דורש.)
4. הוסף ל־`.env.local`:
   - `FIREBASE_ADMIN_PROJECT_ID=...`
   - `FIREBASE_ADMIN_CLIENT_EMAIL=...`
   - `FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
5. אופציונלי (לרינדור וידאו ל־Storage):
   - `FIREBASE_ADMIN_STORAGE_BUCKET=YOUR_PROJECT_ID.appspot.com`  
     (בדרך כלל כמו `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.)

---

## 5. העלאת Firestore Rules ו־Indexes

### אפשרות א׳ – Firebase CLI (מומלץ)

1. התקן CLI אם עדיין לא:
   ```bash
   npm install -g firebase-tools
   ```
2. התחבר:
   ```bash
   firebase login
   ```
3. בשורש הפרויקט (brandblitz-il):
   ```bash
   firebase use --add
   ```
   בחר את הפרויקט שיצרת.
4. העלאת Rules ו־Indexes:
   ```bash
   firebase deploy --only firestore
   ```

### אפשרות ב׳ – העתקה ידנית ב־Console

**Rules**
1. **Firestore Database** → **Rules**.
2. החלף את התוכן בתוכן הקובץ `firestore.rules` מהפרויקט.
3. **Publish**.

**Indexes**
1. **Firestore Database** → **Indexes**.
2. **Add index**:
   - Collection ID: `generations`
   - Fields: `userId` (Ascending), `createdAt` (Descending)
   - Query scope: Collection
3. **Create**.

---

## 6. וידוא שהכל עובד

1. הרץ את האפליקציה:
   ```bash
   npm run dev
   ```
2. גלוש לאתר והתחבר (האפליקציה תפתח Anonymous session אוטומטית).
3. בדשבורד – אמור להופיע יתרת קרדיטים (אחרי ש־Providers יוצר את `users/{uid}/credits/summary`).
4. ב־Firestore Console – תחת **users** אמור להופיע מסמך עם ה־uid, ותחתיו `credits/summary` עם `balance` ו־`updatedAt`.
5. צור "יצירה חדשה" מהאפליקציה (בלי Make) – ב־Firestore אמור להיווצר מסמך ב־**generations** עם `status: processing` (אם Firebase Admin מוגדר ו־/api/generate רץ בהצלחה).

---

## סיכום מבנה Firestore

| נתיב | שימוש |
|------|--------|
| `users/{uid}/credits/summary` | יתרת קרדיטים. Client קורא/כותב (כתיבה ראשונית ב־Providers). Server מעדכן בחיוב ב־/api/generate. |
| `generations/{genId}` | נכס שנוצר. רק Server כותב. Client קורא מסמכים שבהם `userId == auth.uid`. |

אחרי שכל השלבים עובדים – Firebase בפרויקט מוכן. מכאן אפשר להמשיך ל־Make.com ולבדיקות מקצה לקצה.
