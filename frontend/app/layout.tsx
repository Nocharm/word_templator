import type { Metadata } from "next";
import Script from "next/script";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { fetchMe } from "@/lib/auth";
import { getServerLanguage } from "@/lib/i18n-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Word Templator",
  description: "Convert Word documents to a standard format.",
};

// Hydration 전에 localStorage 의 테마/폰트/언어를 <html> 에 반영 — FOUC 방지.
const NO_FLASH_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('wt-settings');
    var s = raw ? JSON.parse(raw) : {};
    var theme = (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system')) ? s.theme : 'system';
    var scale = (s && (s.fontScale === 'sm' || s.fontScale === 'md' || s.fontScale === 'lg')) ? s.fontScale : 'md';
    var lang = (s && (s.language === 'en' || s.language === 'ko')) ? s.language : null;
    var html = document.documentElement;
    html.setAttribute('data-theme', theme);
    if (theme === 'system') {
      var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.setAttribute('data-theme-resolved', dark ? 'dark' : 'light');
    }
    html.setAttribute('data-font-scale', scale);
    if (lang) {
      html.setAttribute('data-lang', lang);
      html.setAttribute('lang', lang);
      // cookie 와 localStorage 동기화 — 서버가 다음 요청에서 같은 언어를 본다.
      document.cookie = 'wt-lang=' + lang + '; path=/; max-age=31536000; SameSite=Lax';
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [me, lang] = await Promise.all([fetchMe(), getServerLanguage()]);
  return (
    <html lang={lang}>
      <head>
        <Script id="wt-no-flash" strategy="beforeInteractive">
          {NO_FLASH_SCRIPT}
        </Script>
      </head>
      <body>
        <Providers initialLanguage={lang}>
          <AppShell email={me?.email ?? null} role={me?.role ?? null}>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
