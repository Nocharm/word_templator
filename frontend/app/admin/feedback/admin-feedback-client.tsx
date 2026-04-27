"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
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

type StatusFilter = FeedbackStatus | "all";
type CategoryFilter = FeedbackCategory | "all";

function categoryLabel(c: FeedbackCategory, t: TFunction): string {
  return t(CATEGORY_KEY[c]);
}

function statusLabel(s: FeedbackStatus, t: TFunction): string {
  return t(STATUS_KEY[s]);
}

export function AdminFeedbackClient() {
  const { t, language } = useSettings();
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";

  const [list, setList] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const items = await api.listAdminFeedback({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
      });
      setList(items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter]);

  const counts = useMemo(() => {
    const open = list.filter((f) => f.status === "open").length;
    const progress = list.filter((f) => f.status === "in_progress").length;
    const closed = list.filter((f) => f.status === "closed").length;
    return { open, progress, closed, total: list.length };
  }, [list]);

  async function handleUpdate(
    id: string,
    patch: { status?: FeedbackStatus; admin_note?: string },
  ) {
    try {
      const updated = await api.updateAdminFeedback(id, patch);
      setList((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 pt-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("adminFb.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {t("adminFb.counts", {
              total: counts.total,
              open: counts.open,
              progress: counts.progress,
              closed: counts.closed,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="rounded-token border border-border bg-surface-elevated px-3 py-1.5 text-sm hover:bg-surface"
        >
          {t("adminFb.refresh")}
        </button>
      </header>

      {error ? (
        <div className="mt-4 rounded-token bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <FilterChips<StatusFilter>
          label={t("adminFb.filterStatus")}
          value={statusFilter}
          options={[
            { value: "all", label: t("adminFb.all") },
            { value: "open", label: statusLabel("open", t) },
            { value: "in_progress", label: statusLabel("in_progress", t) },
            { value: "closed", label: statusLabel("closed", t) },
          ]}
          onChange={setStatusFilter}
        />
        <FilterChips<CategoryFilter>
          label={t("adminFb.filterCategory")}
          value={categoryFilter}
          options={[
            { value: "all", label: t("adminFb.all") },
            { value: "bug", label: categoryLabel("bug", t) },
            { value: "feature", label: categoryLabel("feature", t) },
            { value: "other", label: categoryLabel("other", t) },
          ]}
          onChange={setCategoryFilter}
        />
      </div>

      <section className="mt-6">
        {loading ? (
          <p className="text-sm text-text-muted">{t("common.loading")}</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-text-muted">{t("adminFb.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.map((fb) => {
              const expanded = openId === fb.id;
              return (
                <li
                  key={fb.id}
                  className="rounded-token-lg border border-border bg-surface-elevated"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(expanded ? null : fb.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-xs text-text-muted">{categoryLabel(fb.category, t)}</span>
                    <span
                      className={clsx(
                        "rounded-token px-2 py-0.5 text-xs font-medium",
                        STATUS_BADGE[fb.status],
                      )}
                    >
                      {statusLabel(fb.status, t)}
                    </span>
                    <span className="flex-1 truncate font-medium">{fb.title}</span>
                    <span className="hidden md:inline truncate text-xs text-text-muted max-w-[180px]">
                      {fb.user_email ?? fb.user_id}
                    </span>
                    <span className="text-xs text-text-muted">
                      {new Date(fb.created_at).toLocaleDateString(dateLocale)}
                    </span>
                    <span className="text-xs text-text-muted">{expanded ? "▾" : "▸"}</span>
                  </button>

                  {expanded ? (
                    <FeedbackDetail feedback={fb} onUpdate={handleUpdate} t={t} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function FilterChips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              type="button"
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={clsx(
                "rounded-token border px-3 py-1 text-xs transition",
                selected
                  ? "border-primary bg-primary/10 text-text"
                  : "border-border bg-bg text-text-muted hover:text-text hover:bg-surface",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedbackDetail({
  feedback,
  onUpdate,
  t,
}: {
  feedback: Feedback;
  onUpdate: (id: string, patch: { status?: FeedbackStatus; admin_note?: string }) => Promise<void>;
  t: TFunction;
}) {
  const [note, setNote] = useState(feedback.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = note !== (feedback.admin_note ?? "");

  async function handleStatusChange(s: FeedbackStatus) {
    if (s === feedback.status) return;
    await onUpdate(feedback.id, { status: s });
  }

  async function handleNoteSave() {
    setSaving(true);
    try {
      await onUpdate(feedback.id, { admin_note: note });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border px-4 py-4">
      <p className="whitespace-pre-wrap text-sm">{feedback.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted">{t("adminFb.statusLabel")}</span>
        {(["open", "in_progress", "closed"] as FeedbackStatus[]).map((s) => {
          const selected = s === feedback.status;
          return (
            <button
              type="button"
              key={s}
              onClick={() => handleStatusChange(s)}
              className={clsx(
                "rounded-token border px-3 py-1 text-xs transition",
                selected
                  ? "border-primary bg-primary/10 text-text font-medium"
                  : "border-border bg-bg text-text-muted hover:text-text hover:bg-surface",
              )}
            >
              {statusLabel(s, t)}
            </button>
          );
        })}
      </div>

      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span className="text-text-muted">{t("adminFb.replyNote")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={5000}
          className="form-input resize-y"
          placeholder={t("adminFb.replyPlaceholder")}
        />
      </label>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleNoteSave}
          disabled={!dirty || saving}
          className="rounded-token bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? t("adminFb.saving") : t("adminFb.saveNote")}
        </button>
      </div>
    </div>
  );
}
