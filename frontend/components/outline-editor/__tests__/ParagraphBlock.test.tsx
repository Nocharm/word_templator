import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

const skipBlock: Block = {
  id: "b-skip",
  kind: "paragraph",
  level: 3,
  text: "스킵된 H3",
  warning: "heading_skip",
};

describe("ParagraphBlock warning=heading_skip", () => {
  it("renders yellow left border", () => {
    render(
      <SettingsProvider>
        <ParagraphBlock
          block={skipBlock}
          isSelected={false}
          parentLevel={0}
          headingNumber={null}
          onSelect={() => {}}
        />
      </SettingsProvider>,
    );
    const el = screen.getByText("스킵된 H3").closest("div");
    expect(el?.className).toMatch(/border-warning|border-yellow/);
  });

  it("renders quick-fix button that calls onChangeBlock with level - 1, warning cleared", () => {
    const onChangeBlock = vi.fn();
    render(
      <SettingsProvider>
        <ParagraphBlock
          block={skipBlock}
          isSelected={false}
          parentLevel={0}
          headingNumber={null}
          onSelect={() => {}}
          onChangeBlock={onChangeBlock}
        />
      </SettingsProvider>,
    );
    const btn = screen.getByRole("button", { name: /끌어올리기|Promote/ });
    fireEvent.click(btn);
    expect(onChangeBlock).toHaveBeenCalledWith({ ...skipBlock, level: 2, warning: null });
  });
});
