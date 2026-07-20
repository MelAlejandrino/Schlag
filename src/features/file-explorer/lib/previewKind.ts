type PreviewKind = "image" | "video" | "pdf" | "markdown" | "text" | "office" | "archive" | "unsupported";

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "mkv", "avi"];
const MARKDOWN_EXTENSIONS = ["md", "markdown"];
const OFFICE_EXTENSIONS = ["docx", "xlsx", "pptx"];
const ARCHIVE_EXTENSIONS = ["zip"];
// Mirrors content_index.rs's EXTRACTABLE_EXTENSIONS code/config list (minus
// markdown/office, which get their own categories above) — anything the
// backend's extract_text() can already turn into plain text.
const TEXT_EXTENSIONS = [
  "txt", "csv",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rs", "go", "java", "kt", "swift", "c", "h", "cpp", "hpp", "cs",
  "rb", "php", "sh", "ps1", "sql", "html", "css", "scss", "json", "yaml", "yml", "toml", "xml", "vue", "svelte",
];

// A dot at index 0 is a dotfile (".gitignore"), not an extension — matches
// Rust's Path::extension(), which also treats a leading dot as part of the
// filename, not a suffix.
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  return name.slice(dot + 1).toLowerCase();
}

export function previewKind(name: string): PreviewKind {
  const ext = extensionOf(name);
  if (!ext) return "unsupported";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (MARKDOWN_EXTENSIONS.includes(ext)) return "markdown";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";
  if (ARCHIVE_EXTENSIONS.includes(ext)) return "archive";
  if (TEXT_EXTENSIONS.includes(ext)) return "text";
  return "unsupported";
}
