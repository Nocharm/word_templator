export type DetectedBy = "word_style" | "heuristic" | "user";
export type BlockKind = "paragraph" | "table" | "image" | "field";

export interface Block {
  id: string;
  kind: BlockKind;
  level: number;
  text?: string | null;
  detected_by?: DetectedBy | null;
  markdown?: string | null;
  preview_url?: string | null;
  caption?: string | null;
  raw_ref?: string | null;
  field_kind?: string | null;
  preview_text?: string | null;
}

export interface Outline {
  job_id: string;
  source_filename: string;
  blocks: Block[];
}

export interface Template {
  id: string;
  name: string;
  is_builtin: boolean;
  spec: Record<string, unknown>;
}

export interface FontDef {
  korean: string;
  ascii: string;
  size_pt: number;
  bold?: boolean;
}

export interface StyleSpec {
  fonts: {
    body: FontDef;
    heading: { h1: FontDef; h2: FontDef; h3: FontDef };
  };
  paragraph: {
    line_spacing: number;
    alignment: "left" | "right" | "center" | "justify";
    first_line_indent_pt: number;
  };
  numbering: { h1: string; h2: string; h3: string; list: "decimal" | "bullet" | "korean" };
  table: {
    border_color: string;
    border_width_pt: number;
    header_bg: string;
    header_bold: boolean;
    cell_font_size_pt: number;
  };
  page: {
    margin_top_mm: number;
    margin_bottom_mm: number;
    margin_left_mm: number;
    margin_right_mm: number;
  };
}

export interface JobSummary {
  id: string;
  original_filename: string;
  status: string;
  created_at: string;
  applied_template_name?: string | null;
}
