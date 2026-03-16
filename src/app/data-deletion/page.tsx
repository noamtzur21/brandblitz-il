export const metadata = {
  title: "מחיקת מידע | BrandBlitz",
};

export default function DataDeletionPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const code = searchParams?.code ? String(searchParams.code) : "";
  return (
    <main className="min-h-screen bb-bg">
      <div className="bb-container py-12">
        <div className="bb-card bb-neon p-6 sm:p-10">
          <h1 className="text-xl sm:text-2xl font-semibold">הנחיות למחיקת מידע</h1>
          <p className="mt-2 text-sm text-white/70">
            דף זה נועד לדרישות Meta / GDPR ומסביר למשתמש איך לנתק חיבורים ולבקש מחיקה.
          </p>

          <div className="mt-8 space-y-6 text-sm text-white/80 leading-7">
            <section>
              <div className="text-sm font-semibold">ניתוק חיבור אינסטגרם/פייסבוק (Meta)</div>
              <ol className="mt-2 list-decimal pr-5 space-y-1 text-white/75">
                <li>היכנס/י ל״הגדרות משתמש״ באפליקציה.</li>
                <li>בקטע ״חיבור אינסטגרם / פייסבוק״ לחץ/י על ״נתק״.</li>
                <li>אופציונלי: ב‑Facebook/Instagram Settings הסר/י את האפליקציה מרשימת האפליקציות המחוברות.</li>
              </ol>
            </section>

            <section>
              <div className="text-sm font-semibold">מחיקת נתונים מהמערכת</div>
              <p className="mt-2 text-white/75">
                כדי לבקש מחיקה מלאה (כולל יצירות, קבצים, והגדרות), יש לשלוח בקשה לבעל האתר. בבקשה ציין/י את האימייל שמחובר לחשבון.
              </p>
              <p className="mt-2 text-white/75">
                לאחר אימות בעלות, נמחק את הנתונים הרלוונטיים ממסדי הנתונים שלנו תוך זמן סביר.
              </p>
              {code ? (
                <p className="mt-3 text-xs text-white/60">
                  קוד אישור: <span className="font-mono text-white/80">{code}</span>
                </p>
              ) : null}
            </section>

            <section>
              <div className="text-sm font-semibold">מה נמחק</div>
              <ul className="mt-2 list-disc pr-5 space-y-1 text-white/75">
                <li>חיבורי Meta (טוקנים ומזהים).</li>
                <li>הגדרות משתמש (לוגו/צבע מותג).</li>
                <li>יצירות ותוצאות (תמונות/וידאו) וקישורים לקבצים.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

