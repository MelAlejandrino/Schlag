import { describe, expect, it } from "vitest";
import { promoteExactMatch } from "./promoteExactMatch";

const item = (name: string) => ({ name, path: `C:\\${name}` });

describe("promoteExactMatch", () => {
  it("leaves the list untouched when nothing matches exactly", () => {
    const items = [item("a.txt"), item("b.txt")];
    expect(promoteExactMatch(items, "nope")).toEqual(items);
  });

  it("leaves the list untouched when the query is empty", () => {
    const items = [item("a.txt"), item("b.txt")];
    expect(promoteExactMatch(items, "  ")).toBe(items);
  });

  it("moves an exact full-name match to the front", () => {
    const items = [item("billing_report.pdf"), item("billing.pdf"), item("other.pdf")];
    expect(promoteExactMatch(items, "billing.pdf").map((i) => i.name)).toEqual([
      "billing.pdf",
      "billing_report.pdf",
      "other.pdf",
    ]);
  });

  it("matches the name without its extension too", () => {
    const items = [item("billing_report.pdf"), item("billing.pdf")];
    expect(promoteExactMatch(items, "billing").map((i) => i.name)).toEqual(["billing.pdf", "billing_report.pdf"]);
  });

  it("is case-insensitive", () => {
    const items = [item("Other.txt"), item("Billing.PDF")];
    expect(promoteExactMatch(items, "billing.pdf").map((i) => i.name)).toEqual(["Billing.PDF", "Other.txt"]);
  });

  it("does nothing when the exact match is already first", () => {
    const items = [item("billing.pdf"), item("other.pdf")];
    expect(promoteExactMatch(items, "billing.pdf")).toBe(items);
  });
});
