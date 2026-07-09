import { describe, expect, it } from "vitest";
import { iconNameFor } from "./fileTypeIcon";

describe("iconNameFor", () => {
  it("resolves a plain extension", () => {
    expect(iconNameFor("photo.png")).toBe("image");
  });

  it("resolves a compound extension longest-suffix-first", () => {
    expect(iconNameFor("component.spec.ts")).toBe("test-ts");
    expect(iconNameFor("component.ts")).toBe("typescript");
  });

  it("is case-insensitive for extensions", () => {
    expect(iconNameFor("PHOTO.PNG")).toBe("image");
  });

  it("treats a leading-dot name's own suffix as an extension candidate, not as no-extension", () => {
    // ".env"/".dockerignore" have no fileNames entry of their own in the
    // real manifest — they're only resolvable by trying "env"/"dockerignore"
    // as an extension, which requires NOT special-casing the leading dot the
    // way previewKind.ts's extensionOf (correctly, for its own purpose) does.
    expect(iconNameFor(".env")).toBe("tune");
    expect(iconNameFor(".dockerignore")).toBe("docker");
  });

  it("prefers an exact filename match over any extension match", () => {
    expect(iconNameFor("Dockerfile")).toBe("docker");
  });

  it("falls back to the theme's own generic file icon for an unknown name", () => {
    expect(iconNameFor("totally-unrecognized-file")).toBe("file");
    expect(iconNameFor("mystery.zzzzz")).toBe("file");
  });

  it("falls back to the generic file icon for a name with no dot and no fileNames entry", () => {
    expect(iconNameFor("SOME_RANDOM_UPPERCASE_NAME")).toBe("file");
  });
});
