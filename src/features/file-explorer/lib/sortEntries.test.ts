import { describe, expect, it } from "vitest";
import { sortEntries } from "./sortEntries";
import type { Entry } from "../file-explorer.types";

function entry(overrides: Partial<Entry>): Entry {
  return { name: "x", path: `C:\\${overrides.name ?? "x"}`, is_dir: false, size: 0, modified_ms: 0, ...overrides };
}

describe("sortEntries", () => {
  it("sorts folders and files together, uniformly by the chosen key", () => {
    const entries = [entry({ name: "b.txt" }), entry({ name: "a-folder", is_dir: true }), entry({ name: "a.txt" })];
    const sorted = sortEntries(entries, "name", "asc");
    expect(sorted.map((e) => e.name)).toEqual(["a-folder", "a.txt", "b.txt"]);
  });

  it("sorts by name using natural/numeric comparison", () => {
    const entries = [entry({ name: "file10.txt" }), entry({ name: "file2.txt" })];
    const sorted = sortEntries(entries, "name", "asc");
    expect(sorted.map((e) => e.name)).toEqual(["file2.txt", "file10.txt"]);
  });

  it("sorts by size", () => {
    const entries = [entry({ name: "big.txt", size: 200 }), entry({ name: "small.txt", size: 10 })];
    const sorted = sortEntries(entries, "size", "asc");
    expect(sorted.map((e) => e.name)).toEqual(["small.txt", "big.txt"]);
  });

  it("sorts by modified time", () => {
    const entries = [entry({ name: "newer.txt", modified_ms: 200 }), entry({ name: "older.txt", modified_ms: 100 })];
    const sorted = sortEntries(entries, "modified", "asc");
    expect(sorted.map((e) => e.name)).toEqual(["older.txt", "newer.txt"]);
  });

  it("sorts by type (extension)", () => {
    const entries = [entry({ name: "a.zip" }), entry({ name: "b.csv" })];
    const sorted = sortEntries(entries, "type", "asc");
    expect(sorted.map((e) => e.name)).toEqual(["b.csv", "a.zip"]);
  });

  it("reverses order (within each group) when direction is descending", () => {
    const entries = [entry({ name: "a.txt" }), entry({ name: "b.txt" })];
    const sorted = sortEntries(entries, "name", "desc");
    expect(sorted.map((e) => e.name)).toEqual(["b.txt", "a.txt"]);
  });

  it("handles an empty array", () => {
    expect(sortEntries([], "name", "asc")).toEqual([]);
  });
});
