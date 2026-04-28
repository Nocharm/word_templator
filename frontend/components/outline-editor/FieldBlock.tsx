"use client";

import { useT } from "@/components/settings-provider";
import type { Block } from "@/lib/types";

export function FieldBlock({ block }: { block: Block }) {
  const t = useT();
  return (
    <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
      {t("field.label")}{block.preview_text ?? ""}
    </div>
  );
}
