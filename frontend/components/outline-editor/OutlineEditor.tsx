"use client";

import clsx from "clsx";
import { Fragment, useMemo, useRef, useState } from "react";
import { useT } from "@/components/settings-provider";
import type { Block, Outline, SectionSpec } from "@/lib/types";
import { ParagraphBlock } from "./ParagraphBlock";
import { TableBlock } from "./TableBlock";
import { ImageBlock } from "./ImageBlock";
import { FieldBlock } from "./FieldBlock";
import { SectionDivider } from "./SectionDivider";

interface Props {
  initial: Outline;
  onChange: (next: Outline) => void;
}

const MAX_LEVEL = 5;

// 헤딩 번호 표시용 — 1./1.1./1.1.1. 형식. 본문(level=0)은 빈 문자열.
// 상위 레벨 카운터가 0인 채로 하위가 등장하면 "0.1." 처럼 그대로 노출 — 구조 결손을 사용자에게 알림.
function computeHeadingNumbers(blocks: Block[]): Map<string, string> {
  const numbers = new Map<string, string>();
  const counters = [0, 0, 0, 0, 0];
  for (const b of blocks) {
    if (b.kind !== "paragraph") continue;
    if (b.level < 1 || b.level > 5) continue;
    counters[b.level - 1] += 1;
    for (let i = b.level; i < 5; i++) counters[i] = 0;
    const parts = counters.slice(0, b.level);
    numbers.set(b.id, parts.join(".") + ".");
  }
  return numbers;
}

export function OutlineEditor({ initial, onChange }: Props) {
  const t = useT();
  const [outline, setOutline] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function paragraphIds(): string[] {
    return outline.blocks.filter((b) => b.kind === "paragraph").map((b) => b.id);
  }

  function update(next: Outline) {
    setOutline(next);
    onChange(next);
  }

  function handleSelect(id: string, mods: { shift: boolean; meta: boolean }) {
    const block = outline.blocks.find((b) => b.id === id);
    if (!block || block.kind !== "paragraph") return;

    if (mods.shift && lastClickedRef.current) {
      const ids = paragraphIds();
      const start = ids.indexOf(lastClickedRef.current);
      const end = ids.indexOf(id);
      if (start === -1 || end === -1) {
        setSelected(new Set([id]));
      } else {
        const [a, b] = start <= end ? [start, end] : [end, start];
        setSelected(new Set(ids.slice(a, b + 1)));
      }
      containerRef.current?.focus();
      return;
    }

    if (mods.meta) {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
      lastClickedRef.current = id;
      containerRef.current?.focus();
      return;
    }

    setSelected(new Set([id]));
    lastClickedRef.current = id;
    containerRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab" && selected.size > 0) {
      e.preventDefault();
      const delta = e.shiftKey ? -1 : 1;
      update({
        ...outline,
        blocks: outline.blocks.map((b) => {
          if (!selected.has(b.id) || b.kind !== "paragraph") return b;
          const newLevel = Math.max(0, Math.min(MAX_LEVEL, b.level + delta));
          if (newLevel === b.level) return b;
          return { ...b, level: newLevel, detected_by: "user" as const };
        }),
      });
    }
  }

  const headingNumbers = useMemo(
    () => computeHeadingNumbers(outline.blocks),
    [outline.blocks],
  );

  // 본문(level=0) 블록은 가장 가까운 선행 헤딩의 레벨을 부모로 인식 → 인덴트·연결선 상속
  function renderBlock(b: Block, parentLevel: number) {
    const nonParagraphIndent =
      ["ml-0", "ml-0", "ml-4", "ml-10", "ml-16", "ml-20"][parentLevel] ?? "ml-20";

    if (b.kind === "paragraph") {
      return (
        <ParagraphBlock
          key={b.id}
          block={b}
          isSelected={selected.has(b.id)}
          parentLevel={parentLevel}
          headingNumber={headingNumbers.get(b.id) ?? null}
          onSelect={handleSelect}
        />
      );
    }
    if (b.kind === "table") {
      return (
        <div key={b.id} className={nonParagraphIndent}>
          <TableBlock block={b} />
        </div>
      );
    }
    if (b.kind === "image") {
      return (
        <div key={b.id} className={nonParagraphIndent}>
          <ImageBlock block={b} />
        </div>
      );
    }
    return (
      <div key={b.id} className={nonParagraphIndent}>
        <FieldBlock block={b} />
      </div>
    );
  }

  function renderBody(blocks: Block[], sections: SectionSpec[] | undefined) {
    // 섹션 정보가 없거나 단일 섹션이면 구분선 생략 — 평소처럼 평탄 렌더.
    if (!sections || sections.length <= 1) {
      let parentLevel = 0;
      return blocks.map((b) => {
        if (b.kind === "paragraph" && b.level >= 1) parentLevel = b.level;
        return renderBlock(b, parentLevel);
      });
    }

    // 섹션별로 묶어 SectionDivider + 그 섹션에 속한 blocks 렌더.
    const blocksById = new Map(blocks.map((b) => [b.id, b]));
    return sections.map((section, sIdx) => {
      let parentLevel = 0;
      return (
        <Fragment key={section.id}>
          <SectionDivider section={section} index={sIdx} isFirst={sIdx === 0} />
          {section.block_ids.map((id) => {
            const b = blocksById.get(id);
            if (!b) return null;
            if (b.kind === "paragraph" && b.level >= 1) parentLevel = b.level;
            return renderBlock(b, parentLevel);
          })}
        </Fragment>
      );
    });
  }

  const count = selected.size;
  const preserved = outline.blocks.filter(
    (b) => b.kind === "paragraph" && b.raw_xml_ref,
  );
  const preservedTotal = preserved.length;
  const reviewable = preserved.filter((b) => b.field_kind === "unknown").length;

  return (
    <div className="space-y-2">
      {preservedTotal > 0 ? (
        <div className="flex items-center gap-2 rounded-token border border-border/60 bg-surface px-3 py-1.5 text-xs text-text-muted">
          <span>📎</span>
          <span>
            {t("outline.preserved", { n: preservedTotal })}
            {reviewable > 0 ? (
              <>
                {" · "}
                <span className="font-medium text-warning">{t("outline.needReview", { n: reviewable })}</span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          {count > 0 ? (
            <>
              <span className="font-medium text-primary">{t("common.selectedCount", { n: count })}</span>
              <span className="mx-2">·</span>
              <kbd className="rounded bg-surface px-1.5 py-0.5">Tab</kbd>
              <span className="mx-1">/</span>
              <kbd className="rounded bg-surface px-1.5 py-0.5">Shift+Tab</kbd>
              {t("outline.selectedKbd")}
            </>
          ) : (
            <>{t("outline.helpHint")}</>
          )}
        </span>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-token border border-border px-2 py-0.5 text-xs hover:bg-surface"
          >
            {t("outline.clearSelection")}
          </button>
        ) : null}
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={clsx(
          "flex flex-col gap-1 rounded-token-lg border bg-surface-elevated p-6 shadow-token-sm outline-none",
          count > 0 ? "border-primary/40" : "border-border",
        )}
      >
        {renderBody(outline.blocks, outline.sections)}
      </div>
    </div>
  );
}
