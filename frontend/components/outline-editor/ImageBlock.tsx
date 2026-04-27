"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";

export function ImageBlock({ block }: { block: Block }) {
  const [hover, setHover] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = block.preview_url ?? null;

  return (
    <div
      className="relative rounded-token border border-border bg-surface px-3 py-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-text-muted">
            🖼 이미지
          </span>
          {block.caption ? (
            <span className="italic text-text-muted">{block.caption}</span>
          ) : (
            <span className="italic text-text-muted">캡션 없음</span>
          )}
        </div>
        {url && !errored ? (
          <span className="text-[11px] text-text-muted">호버하면 미리보기</span>
        ) : null}
      </div>

      {hover && url && !errored ? (
        <div className="mt-2 max-h-72 overflow-auto rounded border border-border bg-bg p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={block.caption ?? "이미지 미리보기"}
            onError={() => setErrored(true)}
            className="block max-h-64 w-auto"
          />
        </div>
      ) : null}

      {block.raw_ref ? (
        <div className="mt-1 text-[11px] text-text-muted/70">
          원본 보존: <code>{block.raw_ref}</code>
        </div>
      ) : null}
    </div>
  );
}
