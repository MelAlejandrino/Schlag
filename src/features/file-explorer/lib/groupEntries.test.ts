import { describe, expect, it } from "vitest";
import { compareGroupKeys, groupKeyFor, toDisplayItems } from "./groupEntries";
import type { Entry } from "../file-explorer.types";

function entry(overrides: Partial<Entry>): Entry {
  return { name: "x", path: `C:\\${overrides.name ?? "x"}`, is_dir: false, size: 0, modified_ms: 0, ...overrides };
}

// Fixed reference point instead of Date.now() — deterministic bucket tests.
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime(); // Jan 15, 2026, noon

describe("groupKeyFor", () => {
  it("buckets by date: today, yesterday, this week, this month, earlier", () => {
    expect(groupKeyFor(entry({ modified_ms: new Date(2026, 0, 15, 9).getTime() }), "modified", NOW)).toBe("Today");
    expect(groupKeyFor(entry({ modified_ms: new Date(2026, 0, 14, 9).getTime() }), "modified", NOW)).toBe("Yesterday");
    expect(groupKeyFor(entry({ modified_ms: new Date(2026, 0, 10, 9).getTime() }), "modified", NOW)).toBe("This Week");
    expect(groupKeyFor(entry({ modified_ms: new Date(2026, 0, 1, 9).getTime() }), "modified", NOW)).toBe("This Month");
    expect(groupKeyFor(entry({ modified_ms: new Date(2025, 10, 1, 9).getTime() }), "modified", NOW)).toBe("Earlier");
  });

  it("buckets by size: empty, small, medium, large", () => {
    expect(groupKeyFor(entry({ size: 0 }), "size")).toBe("Empty");
    expect(groupKeyFor(entry({ size: 1024 }), "size")).toBe("Small");
    expect(groupKeyFor(entry({ size: 10 * 1024 * 1024 }), "size")).toBe("Medium");
    expect(groupKeyFor(entry({ size: 200 * 1024 * 1024 }), "size")).toBe("Large");
  });

  it("groups every folder under its own bucket for size grouping, not Empty", () => {
    expect(groupKeyFor(entry({ is_dir: true, size: 0 }), "size")).toBe("Folder");
  });

  it("groups by type using the extension", () => {
    expect(groupKeyFor(entry({ name: "a.png" }), "type")).toBe("PNG");
    expect(groupKeyFor(entry({ is_dir: true }), "type")).toBe("Folder");
  });

  it("returns an empty key for groupBy none", () => {
    expect(groupKeyFor(entry({}), "none")).toBe("");
  });
});

describe("compareGroupKeys", () => {
  it("orders date buckets chronologically, not alphabetically", () => {
    // Alphabetically "Earlier" < "This Month" < "This Week" < "Today" <
    // "Yesterday" — the wrong order. This is the whole point of the test.
    const labels = ["Earlier", "Today", "This Month", "Yesterday", "This Week"];
    const sorted = [...labels].sort((a, b) => compareGroupKeys(a, b, "modified"));
    expect(sorted).toEqual(["Today", "Yesterday", "This Week", "This Month", "Earlier"]);
  });

  it("orders size buckets by magnitude, not alphabetically", () => {
    // Alphabetically "Empty" < "Large" < "Medium" < "Small" — wrong order.
    const labels = ["Large", "Empty", "Small", "Medium"];
    const sorted = [...labels].sort((a, b) => compareGroupKeys(a, b, "size"));
    expect(sorted).toEqual(["Empty", "Small", "Medium", "Large"]);
  });

  it("falls back to alphabetical order for type grouping", () => {
    const labels = ["PNG", "CSV", "Folder"];
    const sorted = [...labels].sort((a, b) => compareGroupKeys(a, b, "type"));
    expect(sorted).toEqual(["CSV", "Folder", "PNG"]);
  });

  it("reverses group order independently of within-group sort direction", () => {
    const labels = ["Today", "Yesterday", "This Week", "This Month", "Earlier"];
    const sorted = [...labels].sort((a, b) => compareGroupKeys(a, b, "modified", "desc"));
    expect(sorted).toEqual(["Earlier", "This Month", "This Week", "Yesterday", "Today"]);
  });
});

describe("toDisplayItems", () => {
  it("emits no headers at all for groupBy none", () => {
    const entries = [entry({ name: "a.txt" }), entry({ name: "b.txt" })];
    const items = toDisplayItems(entries, "none");
    expect(items.every((i) => i.kind === "entry")).toBe(true);
    expect(items).toHaveLength(2);
  });

  it("inserts a header whenever the group key changes, not once per entry", () => {
    const entries = [
      entry({ name: "a.png" }),
      entry({ name: "b.png" }), // same group as above — no new header
      entry({ name: "c.txt" }),
    ];
    const items = toDisplayItems(entries, "type");
    expect(items.map((i) => (i.kind === "header" ? `H:${i.label}` : `E:${i.entry.name}`))).toEqual([
      "H:PNG",
      "E:a.png",
      "E:b.png",
      "H:TXT",
      "E:c.txt",
    ]);
  });
});
