"use client";

import clsx from "clsx";
import { useT } from "@/components/settings-provider";
import type { SectionSpec } from "@/lib/types";

// 출력 .docx 의 페이지 방향이 바뀌는 지점 + 머리말/꼬리말 존재 여부를 한 줄로 안내.
// 첫 섹션 이전에는 표시하지 않음 (구분 의미 없음).
export function SectionDivider({
  section,
  index,
  isFirst,
}: {
  section: SectionSpec;
  index: number;
  isFirst: boolean;
}) {
  const t = useT();
  const isLandscape = section.orientation === "landscape";
  const orientationKey = isLandscape
    ? "section.orientation.landscape"
    : "section.orientation.portrait";

  const hasHeader = !!(
    section.header_default_ref ||
    section.header_first_ref ||
    section.header_even_ref
  );
  const hasFooter = !!(
    section.footer_default_ref ||
    section.footer_first_ref ||
    section.footer_even_ref
  );

  return (
    <div
      className={clsx(
        "my-2 flex items-center gap-3 rounded-token border border-dashed border-border bg-surface/60 px-3 py-2 text-xs",
        isLandscape ? "border-warning/50 bg-warning/5" : "",
      )}
      title={t("section.preserved")}
    >
      <span className="font-mono text-text-muted">
        {!isFirst ? `· ${t("section.pageBreak")} ·` : ""}
      </span>
      <span className="font-medium">{t("section.divider", { n: index + 1 })}</span>
      <span
        className={clsx(
          "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
          isLandscape
            ? "bg-warning/20 text-warning"
            : "bg-primary/15 text-primary",
        )}
        aria-label={t(orientationKey)}
      >
        {isLandscape ? "↔" : "↕"} {t(orientationKey)}
      </span>
      {hasHeader ? (
        <span className="rounded border border-border bg-bg/60 px-1.5 py-0.5 text-[10px] text-text-muted">
          ▔ {t("section.hasHeader")}
        </span>
      ) : null}
      {hasFooter ? (
        <span className="rounded border border-border bg-bg/60 px-1.5 py-0.5 text-[10px] text-text-muted">
          ▁ {t("section.hasFooter")}
        </span>
      ) : null}
      <span className="ml-auto font-mono text-[10px] text-text-muted/70">
        {Math.round(section.page_width_mm)}×{Math.round(section.page_height_mm)} mm
      </span>
    </div>
  );
}
