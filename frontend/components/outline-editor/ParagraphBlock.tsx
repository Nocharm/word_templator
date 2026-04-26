"use client";

import clsx from "clsx";
import type { Block } from "@/lib/types";

interface Props {
  block: Block;
  onChangeLevel: (id: string, newLevel: number) => void;
}

const LEVEL_INDENT = ["pl-0", "pl-0", "pl-6", "pl-12"];

export function ParagraphBlock({ block, onChangeLevel }: Props) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      onChangeLevel(block.id, Math.min(3, block.level + 1));
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      onChangeLevel(block.id, Math.max(0, block.level - 1));
    }
  }

  const isHeading = block.level >= 1;
  const heuristic = block.detected_by === "heuristic";

  return (
    <div
      tabIndex={0}
      role="textbox"
      aria-label={`paragraph level ${block.level}`}
      onKeyDown={handleKeyDown}
      className={clsx(
        LEVEL_INDENT[block.level] ?? "pl-12",
        "rounded border-l-2 px-2 py-1 outline-none focus:bg-blue-50",
        isHeading ? "font-bold" : "font-normal",
        heuristic ? "border-yellow-400" : "border-gray-200",
      )}
    >
      <span className="mr-2 text-xs text-gray-400">
        {block.level === 0 ? "본문" : `H${block.level}`}
        {heuristic ? " ⚠️" : ""}
      </span>
      {block.text}
    </div>
  );
}
