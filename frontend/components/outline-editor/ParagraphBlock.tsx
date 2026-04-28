"use client";

import clsx from "clsx";
import { useT } from "@/components/settings-provider";
import type { Block } from "@/lib/types";

interface Props {
  block: Block;
  isSelected: boolean;
  parentLevel: number;
  headingNumber: string | null;
  onSelect: (id: string, mods: { shift: boolean; meta: boolean }) => void;
  onChangeBlock?: (next: Block) => void;
}

// 들여쓰기 — 헤딩과 본문이 단계별로 같은 깊이를 공유.
const INDENT = ["ml-0", "ml-0", "ml-4", "ml-10", "ml-16", "ml-20"];

// 헤딩 타이포그래피 — 위→아래 점진적 축소.
const HEADING_TEXT = [
  "",
  "text-2xl font-bold tracking-tight",
  "text-xl font-bold",
  "text-lg font-semibold",
  "text-base font-semibold",
  "text-sm font-medium",
];

// 헤딩 좌측 트랙 + 배경 — 깊이가 한눈에 들어오도록 색/굵기 차이 강화.
const HEADING_DECO = [
  "",
  // H1: chapter 느낌 — 두꺼운 막대 + 좌→우 그라디언트 배경 + 상단 구분선
  "mt-5 pt-3 border-t border-border " +
    "border-l-[6px] border-primary " +
    "bg-gradient-to-r from-primary/15 via-primary/5 to-transparent",
  // H2
  "mt-3 border-l-[5px] border-primary/80 bg-primary/10",
  // H3
  "mt-1 border-l-[4px] border-primary/60 bg-primary/5",
  // H4
  "border-l-[3px] border-primary/40 bg-primary/[0.03]",
  // H5
  "border-l-2 border-primary/30",
];

// 본문 — 부모 헤딩과 시각적으로 묶이도록 점선 좌측 가이드.
const BODY_DECO = [
  "",
  "border-l border-dashed border-primary/25",
  "border-l border-dashed border-primary/20",
  "border-l border-dashed border-primary/15",
  "border-l border-dashed border-primary/10",
  "border-l border-dashed border-primary/10",
];

export function ParagraphBlock({
  block,
  isSelected,
  parentLevel,
  headingNumber,
  onSelect,
  onChangeBlock,
}: Props) {
  const t = useT();
  const isHeading = block.level >= 1;
  const heuristic = block.detected_by === "heuristic";

  const depthIdx = isHeading ? block.level : Math.max(parentLevel, 0);
  const indent = INDENT[depthIdx] ?? "ml-20";
  const textSize = isHeading ? (HEADING_TEXT[block.level] ?? "text-sm") : "text-sm";
  const deco = isHeading
    ? (HEADING_DECO[block.level] ?? "")
    : parentLevel > 0
      ? (BODY_DECO[parentLevel] ?? "")
      : "";

  const isNote = block.subtype === "note";
  const hasSkip = block.warning === "heading_skip";

  function handleClick(e: React.MouseEvent) {
    onSelect(block.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
  }

  return (
    <div
      role="button"
      aria-pressed={isSelected}
      aria-label={block.text || t("paragraph.empty")}
      onClick={handleClick}
      className={clsx(
        indent,
        textSize,
        deco,
        "group flex items-start gap-2 cursor-pointer rounded-r-token px-3 py-1.5 outline-none transition select-none",
        isHeading ? "text-text" : "font-normal text-text",
        isNote && "pl-6 italic border-l-2 border-warning/30",
        hasSkip && "border-l-4 border-warning",
        isSelected && "ring-2 ring-inset ring-primary",
        heuristic && !isSelected && "ring-1 ring-inset ring-warning/60",
      )}
    >
      {/* 깊이 칩 — H1은 padded 큰 라벨, H2~ 는 컴팩트 텍스트 */}
      <span
        className={clsx(
          "shrink-0 self-center rounded font-mono uppercase tracking-wide",
          isHeading
            ? "bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold"
            : "text-text-muted/70 text-[10px] px-1",
          heuristic && "text-warning",
        )}
      >
        {block.level === 0 ? t("paragraph.bodyChip") : `H${block.level}`}
        {heuristic ? " ⚠" : ""}
      </span>

      {isHeading && headingNumber ? (
        <span
          className="shrink-0 self-center rounded bg-bg/70 px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-primary"
          aria-label={headingNumber}
        >
          {headingNumber}
        </span>
      ) : null}

      {block.raw_xml_ref ? (
        <span
          title={
            block.field_kind
              ? t("paragraph.fieldPreservedTitle", { kind: block.field_kind.toUpperCase() })
              : t("paragraph.bookmarkTitle")
          }
          className="shrink-0 inline-flex items-center self-center rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-text-muted"
        >
          📎
        </span>
      ) : null}

      <span className="flex-1 whitespace-pre-wrap break-words leading-snug">
        {block.text || <span className="italic text-text-muted">{t("paragraph.empty")}</span>}
      </span>

      {hasSkip && onChangeBlock ? (
        <button
          type="button"
          className="ml-2 shrink-0 self-center rounded-token border border-warning bg-warning/10 px-2 py-0.5 text-xs text-warning hover:bg-warning/20"
          onClick={(e) => {
            e.stopPropagation();
            onChangeBlock({ ...block, level: Math.max(1, block.level - 1), warning: null });
          }}
        >
          {t("editor.headingSkipQuickFix")}
        </button>
      ) : null}
    </div>
  );
}
