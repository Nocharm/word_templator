import { describe, it, expect } from "vitest";
import type { Block, CaptionRef } from "@/lib/types";

describe("Block extended fields", () => {
  it("optional subtype/warning/caption_refs accepted", () => {
    const ref: CaptionRef = {
      label_kind: "figure",
      detected_number: 1,
      target_block_id: "img-1",
      span: [0, 4],
    };
    const b: Block = {
      id: "b-1",
      kind: "paragraph",
      level: 0,
      subtype: "note",
      warning: "heading_skip",
      caption_refs: [ref],
    };
    expect(b.subtype).toBe("note");
    expect(b.caption_refs?.[0].label_kind).toBe("figure");
  });
});
