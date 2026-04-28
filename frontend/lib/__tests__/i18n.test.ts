import { describe, it, expect } from "vitest";
import { MESSAGES } from "@/lib/i18n";

describe("i18n new keys", () => {
  it.each([
    "editor.headingSkipBlocked",
    "editor.headingSkipQuickFix",
    "caption.placeholder.missing",
    "caption.refMismatch",
  ])("key %s present in both ko and en", (key) => {
    // Cast for index signature access; the test verifies at runtime regardless of TS narrowness
    expect((MESSAGES.ko as Record<string, string>)[key]).toBeDefined();
    expect((MESSAGES.en as Record<string, string>)[key]).toBeDefined();
  });
});
