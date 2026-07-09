import { describe, expect, it } from "vitest";
import { splitHighlights } from "./highlightSnippet";

describe("splitHighlights", () => {
  it("returns the whole text unhighlighted when there are no ranges", () => {
    expect(splitHighlights("hello world", [])).toEqual([{ text: "hello world", highlighted: false }]);
  });

  it("splits a single highlighted range out of surrounding plain text", () => {
    expect(splitHighlights("hello world", [[6, 11]])).toEqual([
      { text: "hello ", highlighted: false },
      { text: "world", highlighted: true },
    ]);
  });

  it("handles a highlight at the very start with no leading plain segment", () => {
    expect(splitHighlights("hello world", [[0, 5]])).toEqual([
      { text: "hello", highlighted: true },
      { text: " world", highlighted: false },
    ]);
  });

  it("handles multiple non-adjacent highlighted ranges", () => {
    expect(splitHighlights("the quick brown fox", [[4, 9], [16, 19]])).toEqual([
      { text: "the ", highlighted: false },
      { text: "quick", highlighted: true },
      { text: " brown ", highlighted: false },
      { text: "fox", highlighted: true },
    ]);
  });

  it("sorts out-of-order ranges before splitting", () => {
    expect(splitHighlights("the quick brown fox", [[16, 19], [4, 9]])).toEqual([
      { text: "the ", highlighted: false },
      { text: "quick", highlighted: true },
      { text: " brown ", highlighted: false },
      { text: "fox", highlighted: true },
    ]);
  });
});
