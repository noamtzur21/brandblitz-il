import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BrandBlitz IL",
  description: "אוטומציית תוכן בהיקף גבוה לעסקים בישראל",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <Script id="bb-strip-extension-attrs" strategy="beforeInteractive">
          {`
          (function () {
            try {
              var els = document.querySelectorAll('[bis_skin_checked],[bis_register]');
              for (var i = 0; i < els.length; i++) {
                els[i].removeAttribute('bis_skin_checked');
                els[i].removeAttribute('bis_register');
              }
              // Some extensions add random __processed_* attributes.
              var all = document.getElementsByTagName('*');
              for (var j = 0; j < all.length; j++) {
                var attrs = all[j].attributes;
                if (!attrs) continue;
                for (var k = attrs.length - 1; k >= 0; k--) {
                  var name = attrs[k] && attrs[k].name;
                  if (name && name.indexOf('__processed_') === 0) {
                    all[j].removeAttribute(name);
                  }
                }
              }
            } catch (e) {}
          })();
          `}
        </Script>
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
