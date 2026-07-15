import { describe, expect, it } from "vitest";
import { dirname } from "./path";
import { isInsideZip, zipRootPath, zipSplit } from "./zipPath";

describe("zipSplit", () => {
  it("returns null for a plain filesystem path", () => {
    expect(zipSplit("C:\\Users\\carlo\\Documents")).toBeNull();
  });

  it("splits a zip root into an archive path with an empty inner path", () => {
    expect(zipSplit("C:\\a\\b.zip!")).toEqual({ archivePath: "C:\\a\\b.zip", innerPath: "" });
  });

  it("splits a nested path inside a zip", () => {
    expect(zipSplit("C:\\a\\b.zip!\\sub\\file.txt")).toEqual({
      archivePath: "C:\\a\\b.zip",
      innerPath: "sub\\file.txt",
    });
  });

  it("is case-insensitive on the .zip extension", () => {
    expect(zipSplit("C:\\a\\B.ZIP!\\file.txt")?.archivePath).toBe("C:\\a\\B.ZIP");
  });
});

describe("isInsideZip / zipRootPath round-trip", () => {
  it("zipRootPath produces a path isInsideZip recognizes", () => {
    const root = zipRootPath("C:\\a\\b.zip");
    expect(isInsideZip(root)).toBe(true);
    expect(zipSplit(root)).toEqual({ archivePath: "C:\\a\\b.zip", innerPath: "" });
  });
});

describe("dirname on a zip virtual path", () => {
  it("exits the zip entirely when going up from its root", () => {
    expect(dirname("C:\\a\\b.zip!")).toBe("C:\\a");
  });

  it("goes up to the zip root from a nested path inside it", () => {
    expect(dirname("C:\\a\\b.zip!\\sub")).toBe("C:\\a\\b.zip!");
  });
});
