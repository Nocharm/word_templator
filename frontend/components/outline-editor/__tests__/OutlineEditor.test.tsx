import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutlineEditor } from "../OutlineEditor";
import { SettingsProvider } from "@/components/settings-provider";
import type { Outline } from "@/lib/types";

// OutlineEditor uses `initial` prop and maintains internal state;
// onChange is called on every update via update().
function wrap(initial: Outline, onChange: (next: Outline) => void) {
  return render(
    <SettingsProvider>
      <OutlineEditor initial={initial} onChange={onChange} />
    </SettingsProvider>,
  );
}

// Clicks a block to select it, then fires a keydown on the editor container.
function clickAndKey(blockText: string, key: string) {
  fireEvent.click(screen.getByText(blockText));
  // keydown must target the container div (tabIndex=0) that holds onKeyDown.
  const container = document.querySelector<HTMLDivElement>("[tabindex='0']");
  if (!container) throw new Error("editor container not found");
  fireEvent.keyDown(container, { key });
}

describe("p hotkey", () => {
  it("converts selected paragraph to body subtype, level 0", () => {
    const initial: Outline = {
      job_id: "j",
      source_filename: "t.docx",
      blocks: [{ id: "b-1", kind: "paragraph", level: 2, text: "테스트" }],
      sections: [],
    };
    const onChange = vi.fn();
    wrap(initial, onChange);

    clickAndKey("테스트", "p");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [expect.objectContaining({ id: "b-1", level: 0, subtype: "body" })],
      }),
    );
  });
});

describe("n hotkey", () => {
  it("converts selected paragraph to note subtype, level 0", () => {
    const initial: Outline = {
      job_id: "j",
      source_filename: "t.docx",
      blocks: [{ id: "b-1", kind: "paragraph", level: 1, text: "노트로" }],
      sections: [],
    };
    const onChange = vi.fn();
    wrap(initial, onChange);

    clickAndKey("노트로", "n");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [expect.objectContaining({ id: "b-1", level: 0, subtype: "note" })],
      }),
    );
  });

  it("ignores hotkey when input is focused (input outside editor scope)", () => {
    // The input is outside the editor container, so keydown on it
    // never reaches the editor's onKeyDown handler → onChange not called.
    const initial: Outline = {
      job_id: "j",
      source_filename: "t",
      blocks: [],
      sections: [],
    };
    const onChange = vi.fn();
    render(
      <div>
        <input data-testid="ti" />
        <SettingsProvider>
          <OutlineEditor initial={initial} onChange={onChange} />
        </SettingsProvider>
      </div>,
    );
    const inp = screen.getByTestId("ti");
    inp.focus();
    fireEvent.keyDown(inp, { key: "n" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Tab skip block", () => {
  it("blocks Tab when target level would skip more than one (H1 → H3)", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t",
      blocks: [
        { id: "b-1", kind: "paragraph", level: 1, text: "H1" },
        { id: "b-2", kind: "paragraph", level: 2, text: "지금 H2 → Tab → H3" },
      ],
      sections: [],
    };
    const onChange = vi.fn();
    wrap(outline, onChange);

    fireEvent.click(screen.getByText(/지금 H2/));
    const editorContainer = document.querySelector<HTMLDivElement>("[tabindex='0']");
    if (!editorContainer) throw new Error("editor container not found");
    fireEvent.keyDown(editorContainer, { key: "Tab" });

    // prev_heading = H1 (1), target = H3 (3), diff = 2 > 1 → blocked
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows Tab when target level is prev_heading + 1", () => {
    const outline: Outline = {
      job_id: "j",
      source_filename: "t",
      blocks: [
        { id: "b-1", kind: "paragraph", level: 1, text: "H1" },
        { id: "b-2", kind: "paragraph", level: 1, text: "지금 H1 → Tab → H2" },
      ],
      sections: [],
    };
    const onChange = vi.fn();
    wrap(outline, onChange);

    fireEvent.click(screen.getByText(/지금 H1/));
    const editorContainer = document.querySelector<HTMLDivElement>("[tabindex='0']");
    if (!editorContainer) throw new Error("editor container not found");
    fireEvent.keyDown(editorContainer, { key: "Tab" });

    // prev_heading = H1, target = H2, diff = 1 → allowed
    expect(onChange).toHaveBeenCalled();
  });
});
