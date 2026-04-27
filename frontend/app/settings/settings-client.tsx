"use client";

import clsx from "clsx";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/components/settings-provider";
import type { MessageKey, TFunction, Language } from "@/lib/i18n";
import type { FontScale, Theme } from "@/lib/settings";

interface OptionDef<T extends string> {
  value: T;
  labelKey: MessageKey;
  hintKey?: MessageKey;
  hint?: string;
}

const THEME_OPTIONS: OptionDef<Theme>[] = [
  { value: "light", labelKey: "settings.theme.light", hintKey: "settings.theme.lightHint" },
  { value: "dark", labelKey: "settings.theme.dark", hintKey: "settings.theme.darkHint" },
  { value: "system", labelKey: "settings.theme.system", hintKey: "settings.theme.systemHint" },
];

const FONT_OPTIONS: OptionDef<FontScale>[] = [
  { value: "sm", labelKey: "settings.font.sm", hint: "14px" },
  { value: "md", labelKey: "settings.font.md", hint: "16px" },
  { value: "lg", labelKey: "settings.font.lg", hint: "18px" },
];

const LANG_OPTIONS: OptionDef<Language>[] = [
  { value: "en", labelKey: "settings.lang.en" },
  { value: "ko", labelKey: "settings.lang.ko" },
];

export function SettingsClient({ email }: { email: string }) {
  const { theme, fontScale, language, setTheme, setFontScale, setLanguage, t } = useSettings();

  return (
    <main className="mx-auto max-w-2xl p-6 pt-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("settings.subtitle")}</p>
      </header>

      <Section title={t("settings.account")} description={t("settings.accountDesc")}>
        <p className="text-sm">{email}</p>
      </Section>

      <Section
        title={t("settings.passwordTitle")}
        description={t("settings.passwordDesc")}
      >
        <PasswordForm t={t} />
      </Section>

      <Section title={t("settings.langTitle")} description={t("settings.langDesc")}>
        <SegmentedGroup
          name="lang"
          options={LANG_OPTIONS}
          value={language}
          onChange={setLanguage}
          t={t}
        />
      </Section>

      <Section title={t("settings.themeTitle")} description={t("settings.themeDesc")}>
        <SegmentedGroup
          name="theme"
          options={THEME_OPTIONS}
          value={theme}
          onChange={setTheme}
          t={t}
        />
      </Section>

      <Section title={t("settings.fontTitle")} description={t("settings.fontDesc")}>
        <SegmentedGroup
          name="font-scale"
          options={FONT_OPTIONS}
          value={fontScale}
          onChange={setFontScale}
          t={t}
        />
        <div className="mt-4 rounded-token border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">{t("settings.fontPreview")}</p>
          <p className="mt-2 text-base">{t("settings.fontPreviewBody")}</p>
          <p className="mt-1 text-xs text-text-muted">{t("settings.fontPreviewCaption")}</p>
        </div>
      </Section>
    </main>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-token-lg border border-border bg-surface-elevated p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SegmentedGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  t,
}: {
  name: string;
  options: OptionDef<T>[];
  value: T;
  onChange: (next: T) => void;
  t: TFunction;
}) {
  const cols = options.length === 2 ? "grid-cols-2" : "grid-cols-3";
  return (
    <div role="radiogroup" aria-label={name} className={`grid gap-2 ${cols}`}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const hintText = opt.hintKey ? t(opt.hintKey) : opt.hint;
        return (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "rounded-token border px-3 py-2 text-sm transition",
              selected
                ? "border-primary bg-primary/10 text-text"
                : "border-border bg-bg text-text-muted hover:text-text hover:bg-surface",
            )}
          >
            <div className="font-medium">{t(opt.labelKey)}</div>
            {hintText ? <div className="mt-0.5 text-xs text-text-muted">{hintText}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

function PasswordForm({ t }: { t: TFunction }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (next.length < 4) {
      setMessage({ kind: "err", text: t("settings.errMin") });
      return;
    }
    if (next !== confirm) {
      setMessage({ kind: "err", text: t("settings.errMatch") });
      return;
    }
    if (next === current) {
      setMessage({ kind: "err", text: t("settings.errSame") });
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ kind: "ok", text: t("settings.passwordOk") });
    } catch (err) {
      const raw = (err as Error).message;
      // "400: ..." 패턴에서 본문만 추출 시도
      const detail = raw.includes("current password incorrect")
        ? t("settings.errCurrentWrong")
        : raw;
      setMessage({ kind: "err", text: detail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field
        label={t("settings.passwordCurrent")}
        type="password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        required
      />
      <Field
        label={t("settings.passwordNew")}
        type="password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        required
      />
      <Field
        label={t("settings.passwordConfirm")}
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        required
      />
      <div className="flex items-center justify-between">
        {message ? (
          <p
            className={clsx(
              "text-sm",
              message.kind === "ok" ? "text-success" : "text-danger",
            )}
          >
            {message.text}
          </p>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? t("settings.passwordUpdating") : t("settings.passwordUpdate")}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="form-input"
      />
    </label>
  );
}
