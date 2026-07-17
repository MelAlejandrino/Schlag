import { describe, expect, it } from "vitest";
import { filterEntries } from "./filterEntries";
import type { Entry } from "../file-explorer.types";

const entry = (name: string): Entry =>
  ({ name, path: `C:\\${name}`, is_dir: false, size: 0, modified_ms: 0 }) as Entry;

const entries = [entry("Report.pdf"), entry("report-draft.md"), entry("photo.png")];

describe("filterEntries", () => {
  it("matches names case-insensitively", () => {
    expect(filterEntries(entries, "REPORT").map((e) => e.name)).toEqual(["Report.pdf", "report-draft.md"]);
  });

  it("returns everything unchanged for an empty/whitespace query", () => {
    expect(filterEntries(entries, "   ")).toBe(entries);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterEntries(entries, "zzz")).toEqual([]);
  });
});
