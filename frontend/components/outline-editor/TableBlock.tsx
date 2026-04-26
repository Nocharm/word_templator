import type { Block } from "@/lib/types";

export function TableBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [표 — 다음 Phase에서 마크다운 렌더] {block.caption ?? ""}
    </div>
  );
}
