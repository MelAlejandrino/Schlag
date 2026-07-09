import { describe, expect, it } from "vitest";
import { basename, dirname, isPathWithin, joinPath, longestMatchingPath, pathSegments } from "./path";

describe("joinPath", () => {
  it("joins with backslash for Windows paths", () => {
    expect(joinPath("C:\\Users\\carlo", "Documents")).toBe("C:\\Users\\carlo\\Documents");
  });

  it("does not double the separator when base already ends with one", () => {
    expect(joinPath("C:\\", "Users")).toBe("C:\\Users");
  });

  it("joins with forward slash for POSIX-style paths", () => {
    expect(joinPath("/home/carlo", "Documents")).toBe("/home/carlo/Documents");
  });
});

describe("dirname", () => {
  it("returns the parent of a nested path", () => {
    expect(dirname("C:\\Users\\carlo\\Documents")).toBe("C:\\Users\\carlo");
  });

  it("normalizes a bare drive letter back into its root form", () => {
    expect(dirname("C:\\Users")).toBe("C:\\");
  });

  it("returns empty string at a drive root, signaling This PC", () => {
    expect(dirname("C:\\")).toBe("");
  });
});

describe("basename", () => {
  it("returns the last segment of a path", () => {
    expect(basename("C:\\Users\\carlo\\Documents")).toBe("Documents");
  });

  it("ignores a trailing separator", () => {
    expect(basename("C:\\Users\\carlo\\")).toBe("carlo");
  });
});

describe("isPathWithin", () => {
  it("matches the base path itself", () => {
    expect(isPathWithin("C:\\Users\\carlo", "C:\\Users\\carlo")).toBe(true);
  });

  it("matches a descendant path", () => {
    expect(isPathWithin("C:\\Users\\carlo\\Documents", "C:\\Users\\carlo")).toBe(true);
  });

  it("does not match a sibling with a similar name prefix", () => {
    expect(isPathWithin("C:\\Users\\carlo2", "C:\\Users\\carlo")).toBe(false);
  });
});

describe("longestMatchingPath", () => {
  it("picks the most specific ancestor, not every matching one", () => {
    const candidates = ["C:\\Users\\carlo", "C:\\Users\\carlo\\Downloads"];
    expect(longestMatchingPath("C:\\Users\\carlo\\Downloads\\report.pdf", candidates)).toBe(
      "C:\\Users\\carlo\\Downloads",
    );
  });

  it("returns null when nothing matches", () => {
    expect(longestMatchingPath("D:\\Games", ["C:\\Users\\carlo"])).toBeNull();
  });
});

describe("pathSegments", () => {
  it("builds a cumulative breadcrumb chain including the drive root", () => {
    expect(pathSegments("C:\\Users\\carlo")).toEqual([
      { label: "C:", path: "C:\\" },
      { label: "Users", path: "C:\\Users" },
      { label: "carlo", path: "C:\\Users\\carlo" },
    ]);
  });
});
