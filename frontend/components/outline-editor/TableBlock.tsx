"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Block } from "@/lib/types";

export function TableBlock({ block }: { block: Block }) {
  return (
    <div className="rounded-token border border-border bg-surface px-3 py-2">
      {block.caption ? (
        <div className="mb-1 text-xs text-text-muted italic">{block.caption}</div>
      ) : null}
      {block.markdown ? (
        <div className="overflow-x-auto text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-surface-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.markdown}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-sm text-text-muted italic">[표 원본만 보존됨 — 미리보기 없음]</div>
      )}
      {block.raw_ref ? (
        <div className="mt-1 text-[11px] text-text-muted/70">
          원본 보존: <code>{block.raw_ref}</code>
        </div>
      ) : null}
    </div>
  );
}
