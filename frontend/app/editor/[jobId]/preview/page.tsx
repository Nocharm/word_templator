"use client";

import clsx from "clsx";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useT } from "@/components/settings-provider";
import { SectionDivider } from "@/components/outline-editor/SectionDivider";
import type { TFunction } from "@/lib/i18n";
import type { Block, Outline, PreviewResponse, SectionSpec } from "@/lib/types";

type PairKind = "unchanged" | "level_changed" | "numbered" | "field_preserved";

type ReasonTag = "level" | "numbered" | "userset" | "field";
interface Reason {
  tag: ReasonTag;
  text: string;
}

interface Pair {
  id: string;
  before: Block | null;
  after: Block | null;
  kind: PairKind;
  reasons: Reason[];
}

function pairBlocks(before: Outline, after: Outline, t: TFunction): Pair[] {
  const beforeMap = new Map(before.blocks.map((b) => [b.id, b]));
  const afterMap = new Map(after.blocks.map((b) => [b.id, b]));
  const ids = Array.from(new Set([...before.blocks, ...after.blocks].map((b) => b.id)));
  const ordered = after.blocks.map((b) => b.id).filter((id) => beforeMap.has(id) || afterMap.has(id));
  const remaining = ids.filter((id) => !ordered.includes(id));
  const finalOrder = [...ordered, ...remaining];

  return finalOrder.map((id) => {
    const b = beforeMap.get(id) ?? null;
    const a = afterMap.get(id) ?? null;
    const reasons: Reason[] = [];

    if (b && a && b.kind === "paragraph" && a.kind === "paragraph") {
      if (b.level !== a.level) {
        const labelOf = (l: number) => (l === 0 ? t("preview.body") : `H${l}`);
        reasons.push({
          tag: "level",
          text: t("preview.levelChange", { from: labelOf(b.level), to: labelOf(a.level) }),
        });
      }
      if ((b.text ?? "") !== (a.text ?? "") && a.level >= 1) {
        reasons.push({ tag: "numbered", text: t("preview.numberingApplied") });
      }
      if (b.detected_by !== "user" && a.detected_by === "user") {
        reasons.push({ tag: "userset", text: t("preview.userSet") });
      }
    }

    if (a?.raw_xml_ref) {
      reasons.push({
        tag: "field",
        text: a.field_kind
          ? t("preview.fieldPreserved", { kind: a.field_kind.toUpperCase() })
          : t("preview.bookmarkPreserved"),
      });
    }

    let kind: PairKind = "unchanged";
    if (a?.raw_xml_ref) kind = "field_preserved";
    if (reasons.some((r) => r.tag === "level")) kind = "level_changed";
    else if (reasons.some((r) => r.tag === "numbered")) kind = "numbered";

    return { id, before: b, after: a, kind, reasons };
  });
}

function levelLabel(level: number, t: TFunction): string {
  return level === 0 ? t("preview.body") : `H${level}`;
}

function BlockCell({
  block,
  side,
  t,
}: {
  block: Block | null;
  side: "before" | "after";
  t: TFunction;
}) {
  if (!block) {
    return <div className="text-text-muted/40 italic text-xs">{t("preview.cellNone")}</div>;
  }
  if (block.kind === "paragraph") {
    const indent = ["pl-0", "pl-2", "pl-5", "pl-8", "pl-10", "pl-12"][block.level] ?? "pl-12";
    const sizeCls = ["text-sm", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"][block.level] ?? "text-sm";
    const isHeading = block.level >= 1;
    return (
      <div className={clsx(indent, "flex items-start gap-2")}>
        <span className="inline-block min-w-[2.5rem] shrink-0 text-[10px] font-medium uppercase text-text-muted">
          {levelLabel(block.level, t)}
        </span>
        <span className={clsx(sizeCls, isHeading ? "font-semibold" : "font-normal", "whitespace-pre-wrap break-words")}>
          {block.text || <span className="italic text-text-muted/60">{t("preview.cellEmpty")}</span>}
        </span>
      </div>
    );
  }
  if (block.kind === "table") {
    return (
      <div className="text-sm">
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">{t("preview.cellTable")}</span>
        {block.caption ? (
          <span className="italic text-text-muted">{block.caption}</span>
        ) : (
          <span className="italic text-text-muted/60">{t("preview.cellNoCaption")}</span>
        )}
        {side === "after" && block.markdown ? (
          <div className="mt-1 ml-2 text-xs text-text-muted/80 whitespace-pre-line">
            {block.markdown.split("\n").slice(0, 4).join("\n")}
            {block.markdown.split("\n").length > 4 ? "\n…" : ""}
          </div>
        ) : null}
      </div>
    );
  }
  if (block.kind === "image") {
    return (
      <div className="text-sm">
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">{t("preview.cellImage")}</span>
        {block.caption ? (
          <span className="italic text-text-muted">{block.caption}</span>
        ) : (
          <span className="italic text-text-muted/60">{t("preview.cellNoCaption")}</span>
        )}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">{t("preview.cellField")}</span>
      <span className="italic text-text-muted">{block.preview_text ?? ""}</span>
    </div>
  );
}

function rowBgClass(kind: PairKind): string {
  switch (kind) {
    case "level_changed":
      return "bg-warning/10";
    case "numbered":
      return "bg-primary/5";
    case "field_preserved":
      return "bg-success/5";
    default:
      return "";
  }
}

// 섹션이 2개 이상이면 각 섹션 시작 직전에 구분선 row 를 끼워 넣는다.
function renderPairsWithSections(
  pairs: Pair[],
  sections: SectionSpec[] | undefined,
  t: TFunction,
) {
  const showDividers = sections && sections.length > 1;
  // pair.id (== block.id) 가 어느 섹션의 첫 블록인지 사전 계산.
  const firstPairBySection = new Map<string, { section: SectionSpec; index: number }>();
  if (showDividers) {
    sections!.forEach((s, idx) => {
      const firstId = s.block_ids.find((id) => pairs.some((p) => p.id === id));
      if (firstId) firstPairBySection.set(firstId, { section: s, index: idx });
    });
  }

  return pairs.map((p) => {
    const sectionStart = firstPairBySection.get(p.id);
    return (
      <Fragment key={p.id}>
        {sectionStart ? (
          <div className="col-span-2 border-b border-border/60 px-3 py-1">
            <SectionDivider
              section={sectionStart.section}
              index={sectionStart.index}
              isFirst={sectionStart.index === 0}
            />
          </div>
        ) : null}
        <div
          className={clsx(
            "grid grid-cols-2 gap-2 border-b border-border/60 px-3 py-2",
            rowBgClass(p.kind),
          )}
        >
          <div className="border-r border-border/40 pr-3">
            <BlockCell block={p.before} side="before" t={t} />
          </div>
          <div className="pl-1">
            <BlockCell block={p.after} side="after" t={t} />
            {p.reasons.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {p.reasons.map((r, i) => (
                  <span
                    key={i}
                    className="rounded bg-bg/60 px-1.5 py-0.5 text-text-muted border border-border/40"
                  >
                    📌 {r.text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Fragment>
    );
  });
}


export default function PreviewPage() {
  const router = useRouter();
  const t = useT();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "changed">("changed");

  useEffect(() => {
    const tplId = sessionStorage.getItem(`preview:${jobId}:template_id`);
    const overridesRaw = sessionStorage.getItem(`preview:${jobId}:overrides`);
    if (!tplId) {
      setError(t("preview.errMissingTpl"));
      return;
    }
    const overrides = overridesRaw ? (JSON.parse(overridesRaw) as Record<string, unknown>) : {};
    api
      .preview(jobId, tplId, overrides)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [jobId, t]);

  const pairs = useMemo(() => {
    if (!data) return [];
    return pairBlocks(data.before, data.after, t);
  }, [data, t]);

  const visiblePairs = useMemo(() => {
    if (filter === "all") return pairs;
    return pairs.filter((p) => p.kind !== "unchanged");
  }, [pairs, filter]);

  const counts = useMemo(() => {
    const c = { total: pairs.length, level: 0, numbered: 0, field: 0 };
    for (const p of pairs) {
      if (p.kind === "level_changed") c.level += 1;
      else if (p.kind === "numbered") c.numbered += 1;
      else if (p.kind === "field_preserved") c.field += 1;
    }
    return c;
  }, [pairs]);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-token-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
        <button
          type="button"
          onClick={() => router.push(`/editor/${jobId}`)}
          className="mt-4 rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
        >
          {t("preview.backToEditor")}
        </button>
      </main>
    );
  }
  if (!data) {
    return <main className="mx-auto max-w-6xl p-6 text-text-muted">{t("preview.loadingPreview")}</main>;
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("preview.title")}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {data.before.source_filename}
            <span className="mx-2">·</span>
            {t("preview.templateLabel")} <span className="font-medium text-text">{data.applied_template_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/editor/${jobId}`)}
            className="rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
          >
            {t("preview.backArrow")}
          </button>
          <a
            href={api.downloadUrl(jobId)}
            className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            {t("preview.download")}
          </a>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-token-lg border border-border bg-surface-elevated px-4 py-2 text-xs">
        <span className="text-text-muted">{t("preview.totalBlocks", { n: counts.total })}</span>
        <span className="text-text-muted">·</span>
        <span className="text-warning font-medium">{t("preview.levelChanged", { n: counts.level })}</span>
        <span className="text-text-muted">·</span>
        <span className="text-primary font-medium">{t("preview.numbered", { n: counts.numbered })}</span>
        <span className="text-text-muted">·</span>
        <span className="text-success font-medium">{t("preview.fieldsBookmarks", { n: counts.field })}</span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setFilter("changed")}
            className={clsx(
              "rounded-token border px-2 py-0.5",
              filter === "changed"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface",
            )}
          >
            {t("preview.changedOnly")}
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={clsx(
              "rounded-token border px-2 py-0.5",
              filter === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface",
            )}
          >
            {t("preview.all")}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-medium text-text-muted">
        <div className="rounded-token border border-border bg-surface px-3 py-1.5">{t("preview.colOriginal")}</div>
        <div className="rounded-token border border-border bg-surface px-3 py-1.5">{t("preview.colConverted")}</div>
      </div>

      <div className="mt-1 overflow-hidden rounded-token-lg border border-border bg-surface-elevated">
        {visiblePairs.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">{t("preview.noChanges")}</div>
        ) : (
          renderPairsWithSections(visiblePairs, data.after.sections, t)
        )}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-token-lg border border-border bg-surface-elevated px-4 py-3">
        <p className="text-sm text-text-muted">
          {t("preview.footerHint", { tpl: data.applied_template_name })}
        </p>
        <a
          href={api.downloadUrl(jobId)}
          className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover whitespace-nowrap"
        >
          {t("preview.download")}
        </a>
      </div>
    </main>
  );
}
