"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "@/components/settings-provider";
import type { Block } from "@/lib/types";

const TABLE_CLASSES = [
  // 기본 테이블
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
  // 헤더 — 짙은 배경 + 굵게 + 좌측 정렬
  "[&_thead_th]:bg-surface [&_thead_th]:font-semibold [&_thead_th]:text-text",
  "[&_thead_th]:border [&_thead_th]:border-border [&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-left",
  // 바디 셀
  "[&_tbody_td]:border [&_tbody_td]:border-border [&_tbody_td]:px-3 [&_tbody_td]:py-1.5 [&_tbody_td]:align-top",
  // zebra striping
  "[&_tbody_tr:nth-child(even)]:bg-surface/50",
  "[&_tbody_tr:hover]:bg-primary/5",
].join(" ");

export function TableBlock({ block }: { block: Block }) {
  const t = useT();
  const hasMarkdown = !!block.markdown && block.markdown.trim().length > 0;

  return (
    <div className="rounded-token-lg border border-border bg-surface-elevated p-3 shadow-token-sm">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{t("table.title")}</span>
        {block.caption ? (
          <span className="font-medium text-text">{block.caption}</span>
        ) : (
          <span className="italic text-text-muted">{t("table.noCaption")}</span>
        )}
      </div>

      {hasMarkdown ? (
        <div className={`overflow-x-auto rounded-token border border-border ${TABLE_CLASSES}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.markdown ?? ""}</ReactMarkdown>
        </div>
      ) : (
        <div className="rounded-token border border-dashed border-border bg-surface px-3 py-4 text-center text-xs text-text-muted">
          {t("table.noPreview")}
        </div>
      )}

      {block.raw_ref ? (
        <div className="mt-2 text-[11px] text-text-muted/70">
          {t("table.rawOoxml")} <code className="rounded bg-surface px-1 py-0.5 font-mono">{block.raw_ref}</code>
        </div>
      ) : null}
    </div>
  );
}
