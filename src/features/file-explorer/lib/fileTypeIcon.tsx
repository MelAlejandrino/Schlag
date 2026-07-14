import { File } from "lucide-react";
import rawMaterialIcons from "material-icon-theme/dist/material-icons.json";

// The real Material Icon Theme data (Philipp Kief, vscode-material-icon-
// theme) — its actual extension/filename → icon-name mapping and its actual
// SVG set, not a hand-rolled lookalike. Cast rather than relying on the
// JSON's own inferred literal-key shape, since every lookup below indexes it
// with a name computed at runtime (a file's real extension), not a literal.
interface MaterialIconsJson {
  iconDefinitions: Record<string, { iconPath: string }>;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  file: string;
}
const materialIcons = rawMaterialIcons as unknown as MaterialIconsJson;

// Every SVG in the package, glob-imported as a build-time asset URL and
// re-keyed by filename so `iconUrl()` can look one up by name. `no-inline` is
// required, not cosmetic: most of these 1250 SVGs are under Vite's default
// 4kb inline threshold, so without it Vite base64-embeds the actual image
// bytes of ~1200 icons directly into the main JS bundle (measured: pushed it
// to 1.7MB) instead of leaving them as separate files an <img> loads only
// when actually rendered on screen.
const ICON_MODULES = import.meta.glob<string>("/node_modules/material-icon-theme/icons/*.svg", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
const ICON_URLS_BY_FILE: Record<string, string> = {};
for (const [path, url] of Object.entries(ICON_MODULES)) {
  ICON_URLS_BY_FILE[path.slice(path.lastIndexOf("/") + 1)] = url;
}

function iconUrl(iconName: string): string | undefined {
  const iconPath = materialIcons.iconDefinitions[iconName]?.iconPath;
  if (!iconPath) return undefined;
  return ICON_URLS_BY_FILE[iconPath.slice(iconPath.lastIndexOf("/") + 1)];
}

// Mirrors VS Code's own file-icon-theme matching spec, NOT Rust's
// Path::extension()/previewKind.ts's "leading dot means dotfile, no
// extension" rule — those are the right call for content-type extraction,
// but wrong here: the manifest itself defines extensions like "env" and
// "dockerignore" specifically to match bare ".env"/".dockerignore" (which
// have no separate fileNames entry of their own), so a leading dot must
// still yield a candidate. Splitting on every "." and dropping just the
// first segment handles both that case (".env" -> ["env"]) and a compound
// extension ("component.spec.ts" -> ["spec.ts", "ts"], longest first, since
// the map has entries for both).
function extensionCandidates(name: string): string[] {
  const parts = name.toLowerCase().split(".");
  if (parts.length < 2) return []; // no dot at all — nothing to try beyond fileNames
  return parts.slice(1).map((_, i) => parts.slice(i + 1).join("."));
}

// Exported only for fileTypeIcon.test.ts — the resolution logic is the
// non-trivial part worth a direct test; the component itself is just an
// <img>/<File> render around this.
export function iconNameFor(name: string): string {
  const byName = materialIcons.fileNames[name] ?? materialIcons.fileNames[name.toLowerCase()];
  if (byName) return byName;
  for (const candidate of extensionCandidates(name)) {
    const byExt = materialIcons.fileExtensions[candidate];
    if (byExt) return byExt;
  }
  return materialIcons.file;
}

interface FileTypeIconProps {
  name: string;
  size: number;
  strokeWidth?: number;
  className?: string;
}

// Files get the real Material Icon Theme glyph for their name/extension
// (including its own generic "file" icon as the catch-all default); the
// plain lucide File glyph is only a last-resort fallback for the
// unreachable case where the glob import missed an asset.
export function FileTypeIcon({ name, size, strokeWidth = 1.5, className }: FileTypeIconProps) {
  const url = iconUrl(iconNameFor(name));
  if (url) {
    return (
      <img
        src={url}
        width={size}
        height={size}
        alt=""
        loading="lazy"
        decoding="async"
        className={`shrink-0 ${className ?? ""}`}
      />
    );
  }
  return <File size={size} strokeWidth={strokeWidth} className={className} />;
}
