"use client";

import clsx from "clsx";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Block, Outline, PreviewResponse } from "@/lib/types";
import { LogoutButton } from "@/components/logout-button";

type PairKind = "unchanged" | "level_changed" | "numbered" | "field_preserved";

interface Pair {
  id: string;
  before: Block | null;
  after: Block | null;
  kind: PairKind;
  reasons: string[];
}

function pairBlocks(before: Outline, after: Outline): Pair[] {
  const beforeMap = new Map(before.blocks.map((b) => [b.id, b]));
  const afterMap = new Map(after.blocks.map((b) => [b.id, b]));
  const ids = Array.from(new Set([...before.blocks, ...after.blocks].map((b) => b.id)));
  const ordered = after.blocks.map((b) => b.id).filter((id) => beforeMap.has(id) || afterMap.has(id));
  const remaining = ids.filter((id) => !ordered.includes(id));
  const finalOrder = [...ordered, ...remaining];

  return finalOrder.map((id) => {
    const b = beforeMap.get(id) ?? null;
    const a = afterMap.get(id) ?? null;
    const reasons: string[] = [];

    if (b && a && b.kind === "paragraph" && a.kind === "paragraph") {
      if (b.level !== a.level) {
        const labelOf = (l: number) => (l === 0 ? "본문" : `H${l}`);
        reasons.push(`레벨 ${labelOf(b.level)} → ${labelOf(a.level)}`);
      }
      if ((b.text ?? "") !== (a.text ?? "") && a.level >= 1) {
        reasons.push("번호 prefix 적용");
      }
      if (b.detected_by !== "user" && a.detected_by === "user") {
        reasons.push("사용자가 수동 지정");
      }
    }

    if (a?.raw_xml_ref) {
      reasons.push(
        a.field_kind ? `필드 보존(${a.field_kind.toUpperCase()})` : "북마크/원본 보존",
      );
    }

    let kind: PairKind = "unchanged";
    if (a?.raw_xml_ref) kind = "field_preserved";
    if (reasons.some((r) => r.startsWith("레벨"))) kind = "level_changed";
    else if (reasons.some((r) => r.startsWith("번호"))) kind = "numbered";

    return { id, before: b, after: a, kind, reasons };
  });
}

function levelLabel(level: number): string {
  return level === 0 ? "본문" : `H${level}`;
}

function BlockCell({ block, side }: { block: Block | null; side: "before" | "after" }) {
  if (!block) {
    return <div className="text-text-muted/40 italic text-xs">(없음)</div>;
  }
  if (block.kind === "paragraph") {
    const indent = ["pl-0", "pl-2", "pl-5", "pl-8", "pl-10", "pl-12"][block.level] ?? "pl-12";
    const sizeCls = ["text-sm", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"][block.level] ?? "text-sm";
    const isHeading = block.level >= 1;
    return (
      <div className={clsx(indent, "flex items-start gap-2")}>
        <span className="inline-block min-w-[2.5rem] shrink-0 text-[10px] font-medium uppercase text-text-muted">
          {levelLabel(block.level)}
        </span>
        <span className={clsx(sizeCls, isHeading ? "font-semibold" : "font-normal", "whitespace-pre-wrap break-words")}>
          {block.text || <span className="italic text-text-muted/60">(빈 문단)</span>}
        </span>
      </div>
    );
  }
  if (block.kind === "table") {
    return (
      <div className="text-sm">
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">표</span>
        {block.caption ? (
          <span className="italic text-text-muted">{block.caption}</span>
        ) : (
          <span className="italic text-text-muted/60">캡션 없음</span>
        )}
        {side === "after" && block.markdown ? (
          <div className="mt-1 ml-2 text-xs text-text-muted/80 whitespace-pre-line">
            {block.markdown.split("\n").slice(0, 4).join("\n")}
            {block.markdown.split("\n").length > 4 ? "\n…" : ""}
          </div>
        ) : null}
      </div>
    );
  }
  if (block.kind === "image") {
    return (
      <div className="text-sm">
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">🖼 이미지</span>
        {block.caption ? (
          <span className="italic text-text-muted">{block.caption}</span>
        ) : (
          <span className="italic text-text-muted/60">캡션 없음</span>
        )}
      </div>
    );
  }
  return (
    <div className="text-sm">
      <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-text-muted mr-2">필드</span>
      <span className="italic text-text-muted">{block.preview_text ?? ""}</span>
    </div>
  );
}

function rowBgClass(kind: PairKind): string {
  switch (kind) {
    case "level_changed":
      return "bg-warning/10";
    case "numbered":
      return "bg-primary/5";
    case "field_preserved":
      return "bg-success/5";
    default:
      return "";
  }
}

export default function PreviewPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "changed">("changed");

  useEffect(() => {
    const tplId = sessionStorage.getItem(`preview:${jobId}:template_id`);
    const overridesRaw = sessionStorage.getItem(`preview:${jobId}:overrides`);
    if (!tplId) {
      setError("템플릿 정보가 없습니다. 에디터로 돌아가 다시 시도하세요.");
      return;
    }
    const overrides = overridesRaw ? (JSON.parse(overridesRaw) as Record<string, unknown>) : {};
    api
      .preview(jobId, tplId, overrides)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [jobId]);

  const pairs = useMemo(() => {
    if (!data) return [];
    return pairBlocks(data.before, data.after);
  }, [data]);

  const visiblePairs = useMemo(() => {
    if (filter === "all") return pairs;
    return pairs.filter((p) => p.kind !== "unchanged");
  }, [pairs, filter]);

  const counts = useMemo(() => {
    const c = { total: pairs.length, level: 0, numbered: 0, field: 0 };
    for (const p of pairs) {
      if (p.kind === "level_changed") c.level += 1;
      else if (p.kind === "numbered") c.numbered += 1;
      else if (p.kind === "field_preserved") c.field += 1;
    }
    return c;
  }, [pairs]);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded-token-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
        <button
          type="button"
          onClick={() => router.push(`/editor/${jobId}`)}
          className="mt-4 rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
        >
          에디터로 돌아가기
        </button>
      </main>
    );
  }
  if (!data) {
    return <main className="mx-auto max-w-6xl p-6 text-text-muted">미리보기 로딩 중...</main>;
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">변환 검토</h1>
          <p className="mt-1 text-sm text-text-muted">
            {data.before.source_filename}
            <span className="mx-2">·</span>
            템플릿: <span className="font-medium text-text">{data.applied_template_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/editor/${jobId}`)}
            className="rounded-token border border-border bg-surface-elevated px-4 py-2 text-sm hover:bg-surface"
          >
            ← 에디터로
          </button>
          <a
            href={api.downloadUrl(jobId)}
            className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            ↓ 다운로드
          </a>
          <LogoutButton />
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-token-lg border border-border bg-surface-elevated px-4 py-2 text-xs">
        <span className="text-text-muted">전체 {counts.total} 블록</span>
        <span className="text-text-muted">·</span>
        <span className="text-warning font-medium">레벨 변경 {counts.level}</span>
        <span className="text-text-muted">·</span>
        <span className="text-primary font-medium">번호 적용 {counts.numbered}</span>
        <span className="text-text-muted">·</span>
        <span className="text-success font-medium">필드/북마크 보존 {counts.field}</span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setFilter("changed")}
            className={clsx(
              "rounded-token border px-2 py-0.5",
              filter === "changed"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface",
            )}
          >
            변경된 항목만
          </button>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={clsx(
              "rounded-token border px-2 py-0.5",
              filter === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:bg-surface",
            )}
          >
            전체
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-medium text-text-muted">
        <div className="rounded-token border border-border bg-surface px-3 py-1.5">원본 (업로드 시점)</div>
        <div className="rounded-token border border-border bg-surface px-3 py-1.5">변환 후 (템플릿 적용)</div>
      </div>

      <div className="mt-1 overflow-hidden rounded-token-lg border border-border bg-surface-elevated">
        {visiblePairs.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">변경된 항목이 없습니다.</div>
        ) : (
          visiblePairs.map((p) => (
            <div
              key={p.id}
              className={clsx(
                "grid grid-cols-2 gap-2 border-b border-border/60 px-3 py-2",
                rowBgClass(p.kind),
              )}
            >
              <div className="border-r border-border/40 pr-3">
                <BlockCell block={p.before} side="before" />
              </div>
              <div className="pl-1">
                <BlockCell block={p.after} side="after" />
                {p.reasons.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                    {p.reasons.map((r, i) => (
                      <span
                        key={i}
                        className="rounded bg-bg/60 px-1.5 py-0.5 text-text-muted border border-border/40"
                      >
                        📌 {r}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 flex items-center justify-between rounded-token-lg border border-border bg-surface-elevated px-4 py-3">
        <p className="text-sm text-text-muted">
          확인 후 다운로드해주세요. 변환된 .docx 는 적용된 템플릿(<span className="text-text">{data.applied_template_name}</span>) 의 폰트·여백·번호 규칙이 반영되어 있습니다.
        </p>
        <a
          href={api.downloadUrl(jobId)}
          className="rounded-token bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover whitespace-nowrap"
        >
          ↓ 다운로드
        </a>
      </div>
    </main>
  );
}
