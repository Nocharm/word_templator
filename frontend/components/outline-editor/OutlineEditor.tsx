"use client";

import { useState } from "react";
import type { Outline } from "@/lib/types";
import { ParagraphBlock } from "./ParagraphBlock";
import { TableBlock } from "./TableBlock";
import { ImageBlock } from "./ImageBlock";
import { FieldBlock } from "./FieldBlock";

interface Props {
  initial: Outline;
  onChange: (next: Outline) => void;
}

export function OutlineEditor({ initial, onChange }: Props) {
  const [outline, setOutline] = useState(initial);

  function updateLevel(id: string, level: number) {
    const next = {
      ...outline,
      blocks: outline.blocks.map((b) =>
        b.id === id ? { ...b, level, detected_by: "user" as const } : b,
      ),
    };
    setOutline(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-1 rounded border bg-white p-4">
      {outline.blocks.map((b) => {
        if (b.kind === "paragraph") return <ParagraphBlock key={b.id} block={b} onChangeLevel={updateLevel} />;
        if (b.kind === "table") return <TableBlock key={b.id} block={b} />;
        if (b.kind === "image") return <ImageBlock key={b.id} block={b} />;
        return <FieldBlock key={b.id} block={b} />;
      })}
    </div>
  );
}
