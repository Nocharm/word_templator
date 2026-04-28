// 사용자 UI 설정 — 테마/폰트 스케일/언어. localStorage 에 저장하고 <html> 의 data-* 로 노출.
// 언어는 cookie 에도 동기화 — 서버 컴포넌트가 SSR 시 사용한다.

import { isLanguage, LANGUAGE_COOKIE, type Language } from "./i18n";

export type Theme = "light" | "dark" | "system";
export type FontScale = "sm" | "md" | "lg";

export interface Settings {
  theme: Theme;
  fontScale: FontScale;
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  fontScale: "md",
  language: "en",
};
export const STORAGE_KEY = "wt-settings";

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

export function isFontScale(v: unknown): v is FontScale {
  return v === "sm" || v === "md" || v === "lg";
}

// SSR/CSR 양쪽에서 안전하게 호출 가능. 잘못된 값은 기본값으로 폴백.
export function readSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      fontScale: isFontScale(parsed.fontScale) ? parsed.fontScale : DEFAULT_SETTINGS.fontScale,
      language: isLanguage(parsed.language) ? parsed.language : DEFAULT_SETTINGS.language,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(s: Settings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / private mode 무시
  }
}

// 1년 만료 쿠키. 서버 컴포넌트가 next/headers cookies() 로 읽는다.
function writeLanguageCookie(lang: Language): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

// <html> 에 data-theme, data-theme-resolved, data-font-scale, data-lang 적용.
// "system" 일 때만 OS 다크모드를 resolved 로 기록 → CSS 가 이걸로 분기.
export function applySettings(s: Settings): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.dataset.theme = s.theme;
  if (s.theme === "system") {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    html.dataset.themeResolved = prefersDark ? "dark" : "light";
  } else {
    delete html.dataset.themeResolved;
  }
  html.dataset.fontScale = s.fontScale;
  html.dataset.lang = s.language;
  html.lang = s.language;
  writeLanguageCookie(s.language);
}
