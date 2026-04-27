"use client";

import clsx from "clsx";
import type { Block } from "@/lib/types";

interface Props {
  block: Block;
  isSelected: boolean;
  parentLevel: number;
  onSelect: (id: string, mods: { shift: boolean; meta: boolean }) => void;
}

const INDENT = ["pl-0", "pl-3", "pl-8", "pl-14", "pl-20", "pl-24"];
const TEXT_SIZE = ["text-base", "text-2xl", "text-xl", "text-lg", "text-base", "text-base"];

const HEADING_DECO = [
  "border-l-2 border-transparent",
  "border-l-4 border-primary bg-primary/10",
  "border-l-4 border-primary/70 bg-primary/5",
  "border-l-[3px] border-primary/55 bg-primary/5",
  "border-l-2 border-primary/40",
  "border-l-2 border-primary/30",
];

const BODY_DECO = [
  "border-l-2 border-transparent",
  "border-l-4 border-primary/20",
  "border-l-4 border-primary/15",
  "border-l-[3px] border-primary/15",
  "border-l-2 border-primary/10",
  "border-l-2 border-primary/10",
];

export function ParagraphBlock({ block, isSelected, parentLevel, onSelect }: Props) {
  const isHeading = block.level >= 1;
  const heuristic = block.detected_by === "heuristic";

  const indentIdx = isHeading ? block.level : parentLevel;
  const indent = INDENT[indentIdx] ?? "pl-24";
  const textSize = TEXT_SIZE[block.level] ?? "text-base";
  const deco = isHeading ? (HEADING_DECO[block.level] ?? "") : (BODY_DECO[parentLevel] ?? "");

  function handleClick(e: React.MouseEvent) {
    onSelect(block.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
  }

  return (
    <div
      role="button"
      aria-pressed={isSelected}
      onClick={handleClick}
      className={clsx(
        indent,
        textSize,
        deco,
        "group flex items-start gap-2 cursor-pointer rounded-token px-3 py-1.5 outline-none transition select-none",
        isHeading ? "font-semibold" : "font-normal text-text",
        isSelected && "ring-2 ring-inset ring-primary",
        heuristic && !isSelected && "ring-1 ring-inset ring-warning/60",
      )}
    >
      <span
        className={clsx(
          "mr-1 inline-block min-w-[2.5rem] text-xs font-medium uppercase tracking-wide opacity-60 group-hover:opacity-100",
          heuristic ? "text-warning" : "text-text-muted",
        )}
      >
        {block.level === 0 ? "본문" : `H${block.level}`}
        {heuristic ? " ⚠" : ""}
      </span>

      <span className="flex-1 whitespace-pre-wrap break-words">
        {block.text || <span className="italic text-text-muted">(빈 문단)</span>}
      </span>
    </div>
  );
}
