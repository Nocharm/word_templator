import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParagraphBlock } from "../ParagraphBlock";
import { SettingsProvider } from "@/components/settings-provider";
import type { Block } from "@/lib/types";

const noteBlock: Block = {
  id: "b-1",
  kind: "paragraph",
  level: 0,
  subtype: "note",
  text: "노트입니다",
};

const bodyBlock: Block = {
  id: "b-2",
  kind: "paragraph",
  level: 0,
  subtype: "body",
  text: "본문입니다",
};

function wrap(block: Block) {
  return render(
    <SettingsProvider>
      <ParagraphBlock
        block={block}
        isSelected={false}
        parentLevel={0}
        headingNumber={null}
        onSelect={() => {}}
      />
    </SettingsProvider>,
  );
}

describe("ParagraphBlock subtype=note", () => {
  it("applies note styling (italic + indent + left border)", () => {
    wrap(noteBlock);
    const el = screen.getByText("노트입니다").closest("div");
    expect(el?.className).toMatch(/italic/);
    expect(el?.className).toMatch(/pl-/);
    expect(el?.className).toMatch(/border-l/);
  });

  it("does not apply note styling for body subtype", () => {
    wrap(bodyBlock);
    const el = screen.getByText("본문입니다").closest("div");
    expect(el?.className).not.toMatch(/italic.*border-l/);
  });
});
