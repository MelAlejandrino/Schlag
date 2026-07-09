import { describe, expect, it } from "vitest";
import { previewKind } from "./previewKind";

describe("previewKind", () => {
  it("recognizes image extensions", () => {
    expect(previewKind("photo.PNG")).toBe("image");
    expect(previewKind("scan.jpeg")).toBe("image");
  });

  it("recognizes video extensions", () => {
    expect(previewKind("clip.mp4")).toBe("video");
  });

  it("recognizes pdf", () => {
    expect(previewKind("report.pdf")).toBe("pdf");
  });

  it("recognizes markdown extensions", () => {
    expect(previewKind("notes.md")).toBe("markdown");
    expect(previewKind("notes.markdown")).toBe("markdown");
  });

  it("recognizes office extensions", () => {
    expect(previewKind("budget.xlsx")).toBe("office");
    expect(previewKind("slides.pptx")).toBe("office");
    expect(previewKind("letter.docx")).toBe("office");
  });

  it("does not recognize legacy binary office formats", () => {
    expect(previewKind("old.doc")).toBe("unsupported");
    expect(previewKind("old.xls")).toBe("unsupported");
  });

  it("recognizes zip archives but not other archive formats", () => {
    expect(previewKind("bundle.zip")).toBe("archive");
    expect(previewKind("bundle.rar")).toBe("unsupported");
  });

  it("recognizes plain text and code files as text", () => {
    expect(previewKind("readme.txt")).toBe("text");
    expect(previewKind("main.rs")).toBe("text");
  });

  it("is case-insensitive", () => {
    expect(previewKind("IMAGE.JPG")).toBe("image");
  });

  it("treats a dotfile as having no extension, not as a match on its full name", () => {
    expect(previewKind(".gitignore")).toBe("unsupported");
  });

  it("treats a name with no dot as unsupported", () => {
    expect(previewKind("README")).toBe("unsupported");
  });
});
