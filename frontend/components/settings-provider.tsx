"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS,
  applySettings,
  readSettings,
  writeSettings,
  type FontScale,
  type Settings,
  type Theme,
} from "@/lib/settings";
import { translate, type Language, type MessageKey, type TFunction } from "@/lib/i18n";

interface SettingsContextValue extends Settings {
  setTheme: (t: Theme) => void;
  setFontScale: (s: FontScale) => void;
  setLanguage: (l: Language) => void;
  t: TFunction;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  // SSR 단계는 서버에서 받은 cookie language 로 시작 → flash 방지.
  // 그 외 theme/font 는 localStorage 가 출처라 기본값 → mount 후 동기화.
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    language: initialLanguage ?? DEFAULT_SETTINGS.language,
  }));

  useEffect(() => {
    const loaded = readSettings();
    setSettings(loaded);
    applySettings(loaded);
  }, []);

  // system 테마일 때 OS 다크모드 토글을 실시간 반영
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applySettings(settings);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [settings]);

  const update = useCallback((next: Settings) => {
    setSettings(next);
    writeSettings(next);
    applySettings(next);
  }, []);

  const setTheme = useCallback(
    (theme: Theme) => update({ ...settings, theme }),
    [settings, update],
  );

  const setFontScale = useCallback(
    (fontScale: FontScale) => update({ ...settings, fontScale }),
    [settings, update],
  );

  const setLanguage = useCallback(
    (language: Language) => update({ ...settings, language }),
    [settings, update],
  );

  const t = useMemo<TFunction>(
    () => (key: MessageKey, vars) => translate(settings.language, key, vars),
    [settings.language],
  );

  return (
    <SettingsContext.Provider value={{ ...settings, setTheme, setFontScale, setLanguage, t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}

// 컴포넌트가 t 만 필요로 할 때 — 단축 훅.
export function useT(): TFunction {
  return useSettings().t;
}
