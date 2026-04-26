import type { Block } from "@/lib/types";

export function FieldBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [참조 — 다음 Phase에서 보존] {block.preview_text ?? ""}
    </div>
  );
}
