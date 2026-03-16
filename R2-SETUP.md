# הגדרת Cloudflare R2 – BrandBlitz IL

הווידאו ש־Remotion מייצר מועלה ל־**R2** (לא ל־Firebase Storage) – אפס egress, זול כשהרבה לקוחות מורידים.

---

## 1. יצירת bucket ב־R2

1. היכנס ל־[Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2 Object Storage**.
2. **Create bucket** → שם (למשל `brandblitz-videos`) → **Create bucket**.
3. אחרי שנוצר: כניסה ל־Bucket → **Settings** → **Public access**:
   - **Allow Access** → ייתכן שיתנו לך כתובת כמו `https://pub-xxxxx.r2.dev`.
   - או לחלופין: **Custom Domains** אם יש לך דומיין (למשל `assets.yourdomain.com`).

---

## 2. API Tokens ל־Worker

1. ב־R2: **Manage R2 API Tokens** (או מ־Overview → **R2 API Tokens**).
2. **Create API token**:
   - שם: `brandblitz-worker`
   - Permissions: **Object Read & Write** (לפחות ל־bucket הזה).
   - **Create API Token**.
3. **העתק מיד** את:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`  
   (הסוד לא יוצג שוב.)

---

## 3. מילוי .env.local

הוסף או עדכן:

| משתנה | מאיפה |
|--------|--------|
| `R2_ACCOUNT_ID` | ב־Cloudflare: דף R2 או כל דף תחת החשבון – ב־URL יש את ה־Account ID (מחרוזת hex). |
| `R2_ACCESS_KEY_ID` | מהשלב הקודם (API token). |
| `R2_SECRET_ACCESS_KEY` | מהשלב הקודם (API token). |
| `R2_BUCKET_NAME` | השם שנתת ל־bucket (למשל `brandblitz-videos`). |
| `R2_PUBLIC_URL` | כתובת הגישה הציבורית: `https://pub-xxxxx.r2.dev` (או הדומיין שבחרת). **בלי** סלאש בסוף. |

דוגמה:

```env
R2_ACCOUNT_ID="a1b2c3d4e5f6g7h8i9j0"
R2_ACCESS_KEY_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
R2_SECRET_ACCESS_KEY="yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
R2_BUCKET_NAME="brandblitz-videos"
R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"
```

---

## 4. וידוא

- הרצת ה־worker: `npm run worker:remotion`.
- יצירת generation מסוג **Remotion** (דרך Make או ידנית ב־Firestore עם `status: rendering`, `sourceImageUrl`, וכו') – ה־worker אמור להעלות את ה־MP4 ל־R2 ולעדכן את `resultUrl` לקישור הציבורי.

קישור סופי לווידאו יהיה: `{R2_PUBLIC_URL}/generations/{genId}/video.mp4`.
