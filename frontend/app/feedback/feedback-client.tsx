"use client";

import clsx from "clsx";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/components/settings-provider";
import type { MessageKey, TFunction } from "@/lib/i18n";
import type { Feedback, FeedbackCategory, FeedbackStatus } from "@/lib/types";

const CATEGORY_KEY: Record<FeedbackCategory, MessageKey> = {
  bug: "feedback.cat.bug",
  feature: "feedback.cat.feature",
  other: "feedback.cat.other",
};

const STATUS_KEY: Record<FeedbackStatus, MessageKey> = {
  open: "feedback.status.open",
  in_progress: "feedback.status.inProgress",
  closed: "feedback.status.closed",
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  open: "bg-info/10 text-info",
  in_progress: "bg-warning/15 text-warning",
  closed: "bg-success/15 text-success",
};

function categoryLabel(c: FeedbackCategory, t: TFunction): string {
  return t(CATEGORY_KEY[c]);
}

function statusLabel(s: FeedbackStatus, t: TFunction): string {
  return t(STATUS_KEY[s]);
}

export function FeedbackClient() {
  const { t, language } = useSettings();
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";

  const [list, setList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      setList(await api.listMyFeedback());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError(t("feedback.errRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    setOkMessage(null);
    try {
      await api.submitFeedback(category, title.trim(), body.trim());
      setTitle("");
      setBody("");
      setOkMessage(t("feedback.successMsg"));
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 pt-12">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("feedback.title")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("feedback.subtitle")}</p>
      </header>

      <section className="mt-6 rounded-token-lg border border-border bg-surface-elevated p-6">
        <h2 className="text-base font-semibold">{t("feedback.submitTitle")}</h2>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(CATEGORY_KEY) as FeedbackCategory[]).map((c) => {
              const selected = c === category;
              return (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setCategory(c)}
                  className={clsx(
                    "rounded-token border px-3 py-2 text-sm transition",
                    selected
                      ? "border-primary bg-primary/10 text-text"
                      : "border-border bg-bg text-text-muted hover:text-text hover:bg-surface",
                  )}
                >
                  {categoryLabel(c, t)}
                </button>
              );
            })}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">{t("feedback.titleField")}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              className="form-input"
              placeholder={t("feedback.titlePlaceholder")}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">{t("feedback.detailsField")}</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={5000}
              required
              rows={6}
              className="form-input resize-y"
              placeholder={t("feedback.detailsPlaceholder")}
            />
          </label>

          <div className="flex items-center justify-between">
            {error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : okMessage ? (
              <p className="text-sm text-success">{okMessage}</p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={submitting || !title.trim() || !body.trim()}
              className="rounded-token bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">{t("feedback.myList", { n: list.length })}</h2>
        {loading ? (
          <p className="mt-3 text-sm text-text-muted">{t("common.loading")}</p>
        ) : list.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">{t("feedback.empty")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {list.map((fb) => (
              <li
                key={fb.id}
                className="rounded-token-lg border border-border bg-surface-elevated p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">{categoryLabel(fb.category, t)}</span>
                  <span
                    className={clsx(
                      "rounded-token px-2 py-0.5 text-xs font-medium",
                      STATUS_BADGE[fb.status],
                    )}
                  >
                    {statusLabel(fb.status, t)}
                  </span>
                  <span className="ml-auto text-xs text-text-muted">
                    {new Date(fb.created_at).toLocaleString(dateLocale)}
                  </span>
                </div>
                <h3 className="mt-2 font-medium">{fb.title}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">{fb.body}</p>
                {fb.admin_note ? (
                  <div className="mt-3 rounded-token border border-warning/30 bg-warning/5 p-3 text-sm">
                    <p className="text-xs font-medium text-warning">{t("feedback.adminReply")}</p>
                    <p className="mt-1 whitespace-pre-wrap">{fb.admin_note}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
