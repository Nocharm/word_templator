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
