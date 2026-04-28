"use client";

import { useState } from "react";
import { useT } from "@/components/settings-provider";
import type { StyleSpec } from "@/lib/types";

interface Props {
  initial: StyleSpec;
  onChange: (next: StyleSpec) => void;
}

export function StyleSpecForm({ initial, onChange }: Props) {
  const t = useT();
  const [spec, setSpec] = useState<StyleSpec>(initial);

  function update(next: StyleSpec) {
    setSpec(next);
    onChange(next);
  }

  function setBodyFont(field: "korean" | "ascii", value: string) {
    update({
      ...spec,
      fonts: { ...spec.fonts, body: { ...spec.fonts.body, [field]: value } },
    });
  }

  function setBodySize(value: number) {
    update({
      ...spec,
      fonts: { ...spec.fonts, body: { ...spec.fonts.body, size_pt: value } },
    });
  }

  function setHeadingSize(level: "h1" | "h2" | "h3", value: number) {
    update({
      ...spec,
      fonts: {
        ...spec.fonts,
        heading: {
          ...spec.fonts.heading,
          [level]: { ...spec.fonts.heading[level], size_pt: value },
        },
      },
    });
  }

  function setHeadingBold(level: "h1" | "h2" | "h3", value: boolean) {
    update({
      ...spec,
      fonts: {
        ...spec.fonts,
        heading: {
          ...spec.fonts.heading,
          [level]: { ...spec.fonts.heading[level], bold: value },
        },
      },
    });
  }

  function setParagraph<K extends keyof StyleSpec["paragraph"]>(field: K, value: StyleSpec["paragraph"][K]) {
    update({ ...spec, paragraph: { ...spec.paragraph, [field]: value } });
  }

  function setMargin(side: "margin_top_mm" | "margin_bottom_mm" | "margin_left_mm" | "margin_right_mm", value: number) {
    update({ ...spec, page: { ...spec.page, [side]: value } });
  }

  const marginLabels = {
    margin_top_mm: t("styleSpec.marginTop"),
    margin_bottom_mm: t("styleSpec.marginBottom"),
    margin_left_mm: t("styleSpec.marginLeft"),
    margin_right_mm: t("styleSpec.marginRight"),
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("styleSpec.bodyFont")}>
        <Row label={t("styleSpec.koreanFont")}>
          <input
            type="text"
            value={spec.fonts.body.korean}
            onChange={(e) => setBodyFont("korean", e.target.value)}
            className="form-input"
          />
        </Row>
        <Row label={t("styleSpec.latinFont")}>
          <input
            type="text"
            value={spec.fonts.body.ascii}
            onChange={(e) => setBodyFont("ascii", e.target.value)}
            className="form-input"
          />
        </Row>
        <Row label={t("styleSpec.size")}>
          <input
            type="number"
            min={6}
            max={48}
            step={0.5}
            value={spec.fonts.body.size_pt}
            onChange={(e) => setBodySize(parseFloat(e.target.value))}
            className="form-input w-24"
          />
        </Row>
      </Section>

      <Section title={t("styleSpec.headings")}>
        {(["h1", "h2", "h3"] as const).map((lvl) => (
          <Row key={lvl} label={lvl.toUpperCase()}>
            <input
              type="number"
              min={6}
              max={64}
              step={0.5}
              value={spec.fonts.heading[lvl].size_pt}
              onChange={(e) => setHeadingSize(lvl, parseFloat(e.target.value))}
              className="form-input w-24"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={spec.fonts.heading[lvl].bold ?? false}
                onChange={(e) => setHeadingBold(lvl, e.target.checked)}
              />
              {t("styleSpec.bold")}
            </label>
          </Row>
        ))}
      </Section>

      <Section title={t("styleSpec.paragraph")}>
        <Row label={t("styleSpec.lineSpacing")}>
          <input
            type="number"
            min={1}
            max={3}
            step={0.1}
            value={spec.paragraph.line_spacing}
            onChange={(e) => setParagraph("line_spacing", parseFloat(e.target.value))}
            className="form-input w-24"
          />
        </Row>
        <Row label={t("styleSpec.alignment")}>
          <select
            value={spec.paragraph.alignment}
            onChange={(e) => setParagraph("alignment", e.target.value as StyleSpec["paragraph"]["alignment"])}
            className="form-input"
          >
            <option value="left">{t("styleSpec.alignLeft")}</option>
            <option value="center">{t("styleSpec.alignCenter")}</option>
            <option value="right">{t("styleSpec.alignRight")}</option>
            <option value="justify">{t("styleSpec.alignJustify")}</option>
          </select>
        </Row>
        <Row label={t("styleSpec.firstLineIndent")}>
          <input
            type="number"
            min={0}
            max={48}
            step={1}
            value={spec.paragraph.first_line_indent_pt}
            onChange={(e) => setParagraph("first_line_indent_pt", parseFloat(e.target.value))}
            className="form-input w-24"
          />
        </Row>
      </Section>

      <Section title={t("styleSpec.pageMargins")}>
        {(["margin_top_mm", "margin_bottom_mm", "margin_left_mm", "margin_right_mm"] as const).map((side) => (
          <Row key={side} label={marginLabels[side]}>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={spec.page[side]}
              onChange={(e) => setMargin(side, parseFloat(e.target.value))}
              className="form-input w-24"
            />
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-token-lg border border-border bg-surface-elevated p-4">
      <legend className="px-2 text-sm font-semibold">{title}</legend>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      <span className="w-32 text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </label>
  );
}
