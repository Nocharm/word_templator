export type DetectedBy =
  | "word_style"
  | "outline_level"
  | "based_on"
  | "heuristic"
  | "user";
export type BlockKind = "paragraph" | "table" | "image" | "field";

export interface CaptionRef {
  label_kind: "figure" | "table";
  detected_number: number;
  target_block_id: string | null;
  span: [number, number];
}

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
  raw_xml_ref?: string | null;
  field_kind?: "toc" | "ref" | "pageref" | null;
  preview_text?: string | null;
  subtype?: "body" | "note" | null;
  warning?: "heading_skip" | null;
  caption_refs?: CaptionRef[];
}

export type Orientation = "portrait" | "landscape";

export interface SectionSpec {
  id: string;
  orientation: Orientation;
  page_width_mm: number;
  page_height_mm: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
  header_default_ref?: string | null;
  header_first_ref?: string | null;
  header_even_ref?: string | null;
  footer_default_ref?: string | null;
  footer_first_ref?: string | null;
  footer_even_ref?: string | null;
  block_ids: string[];
}

export interface Outline {
  job_id: string;
  source_filename: string;
  blocks: Block[];
  sections?: SectionSpec[];
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
    heading: { h1: FontDef; h2: FontDef; h3: FontDef; h4: FontDef; h5: FontDef };
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

export interface BatchUploadItem {
  job_id: string;
  original_filename: string;
  status: "parsed" | "failed";
  error?: string | null;
}

export interface BatchRenderItem {
  job_id: string;
  status: "rendered" | "failed";
  error?: string | null;
}

export type FeedbackCategory = "bug" | "feature" | "other";
export type FeedbackStatus = "open" | "in_progress" | "closed";

export interface Feedback {
  id: string;
  user_id: string;
  user_email?: string | null;
  category: FeedbackCategory;
  title: string;
  body: string;
  status: FeedbackStatus;
  admin_note?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreviewResponse {
  before: Outline;
  after: Outline;
  applied_template_name: string;
  applied_font_summary: {
    body: FontDef;
    h1: FontDef;
    h2: FontDef;
    h3: FontDef;
  };
}
