export const metadata = {
  title: "מדיניות פרטיות | BrandBlitz",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bb-bg">
      <div className="bb-container py-12">
        <div className="bb-card bb-neon p-6 sm:p-10">
          <h1 className="text-xl sm:text-2xl font-semibold">מדיניות פרטיות</h1>
          <p className="mt-2 text-sm text-white/70">
            המסמך הזה מסביר איזה מידע אנחנו אוספים, למה, ואיך אפשר למחוק אותו.
          </p>

          <div className="mt-8 space-y-6 text-sm text-white/80 leading-7">
            <section>
              <div className="text-sm font-semibold">איזה מידע נאסף</div>
              <ul className="mt-2 list-disc pr-5 space-y-1 text-white/75">
                <li>פרטי חשבון: אימייל (אם נרשמת/התחברת) ומזהה משתמש פנימי (UID).</li>
                <li>תוכן שיצרת: בקשות טקסט, קופי/האשטגים ותוצאות (תמונה/וידאו) וקישורים לקבצים.</li>
                <li>הגדרות משתמש: לוגו עסקי וצבע מותג (אם הזנת).</li>
                <li>חיבור Meta (אינסטגרם/פייסבוק): טוקנים ומזהי עמודים/חשבונות — נשמרים בצד שרת בלבד.</li>
              </ul>
            </section>

            <section>
              <div className="text-sm font-semibold">למה אנחנו צריכים את זה</div>
              <ul className="mt-2 list-disc pr-5 space-y-1 text-white/75">
                <li>כדי לאפשר התחברות ושמירה של קרדיטים והיסטוריית יצירות.</li>
                <li>כדי להפיק את התוכן (תמונות/וידאו) ולשמור אותו עבורך.</li>
                <li>כדי לפרסם עבורך לפייסבוק/אינסטגרם כאשר אתה משתמש ב״פוסט מהיר״.</li>
              </ul>
            </section>

            <section>
              <div className="text-sm font-semibold">שיתוף מידע</div>
              <p className="mt-2 text-white/75">
                אנחנו לא מוכרים מידע. לשם פעולה המוצר משתמש בשירותים חיצוניים (לדוגמה: Meta לפרסום, ספקי ענן לאחסון קבצים,
                וספקי AI ליצירה). שימוש בשירותים האלו נעשה כדי לספק את הפיצ׳רים שביקשת.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">אבטחה</div>
              <p className="mt-2 text-white/75">
                טוקנים של חיבור Meta נשמרים במסלול שרת‑בלבד ומוגנים מחוקים של Firebase כך שהקליינט לא יכול לקרוא/לכתוב אותם ישירות.
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">מחיקת מידע</div>
              <p className="mt-2 text-white/75">
                ניתן למחוק את המידע שלך לפי ההנחיות בדף{" "}
                <a className="underline underline-offset-4" href="/data-deletion">
                  מחיקת מידע
                </a>
                .
              </p>
            </section>

            <section>
              <div className="text-sm font-semibold">יצירת קשר</div>
              <p className="mt-2 text-white/75">
                אם תרצה למחוק מידע או לשאול שאלה לגבי פרטיות, פנה אלינו דרך פרטי הקשר של בעל האתר.
              </p>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

