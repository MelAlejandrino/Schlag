import { describe, expect, it } from "vitest";
import { snippetParts } from "./highlightSnippet";

describe("snippetParts", () => {
  it("splits around each highlighted range", () => {
    expect(snippetParts("the quick fox", [[4, 9]])).toEqual([
      { text: "the ", hit: false },
      { text: "quick", hit: true },
      { text: " fox", hit: false },
    ]);
  });

  it("handles multiple, unsorted, and adjacent ranges", () => {
    expect(snippetParts("ab cd", [[3, 5], [0, 2]])).toEqual([
      { text: "ab", hit: true },
      { text: " ", hit: false },
      { text: "cd", hit: true },
    ]);
  });

  it("skips overlapping, empty, and out-of-bounds ranges", () => {
    expect(snippetParts("abc", [[0, 2], [1, 3], [2, 2], [0, 99]])).toEqual([
      { text: "ab", hit: true },
      { text: "c", hit: false },
    ]);
  });

  it("collapses newlines, tabs, and indentation runs — including across part boundaries", () => {
    // A code-file fragment: leading indentation, an embedded newline, and a
    // run of spaces butting up against the highlighted term.
    expect(snippetParts("\n    const  budget =\n\t  total;", [[12, 18]])).toEqual([
      { text: "const ", hit: false },
      { text: "budget", hit: true },
      { text: " = total;", hit: false },
    ]);
  });

  it("returns the whole text unhighlighted when there are no ranges", () => {
    expect(snippetParts("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
});
