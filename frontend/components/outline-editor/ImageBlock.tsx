import type { Block } from "@/lib/types";

export function ImageBlock({ block }: { block: Block }) {
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      [이미지 — 다음 Phase에서 미리보기] {block.caption ?? ""}
    </div>
  );
}
