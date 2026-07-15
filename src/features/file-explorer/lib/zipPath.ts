// Browsing a zip like a folder (plan.md's Phase 7 sketch): a virtual-path
// scheme where a bare "!" marker sits inside the archive's own path segment
// ("archive.zip!\sub\file.txt") so lib/path.ts's dirname/basename/joinPath/
// pathSegments keep working completely unmodified for breadcrumbs and
// up-navigation — going up out of a zip's root is just dirname() stripping
// the "archive.zip!" segment like any other folder name.
const EXT = ".zip";
const MARKER = `${EXT}!`;

export interface ZipLocation {
  archivePath: string;
  innerPath: string;
}

// null when `path` isn't inside any zip.
//
// ponytail: detection is a plain substring match on the marker, so a real
// (non-archive) file whose own name happens to contain the literal substring
// ".zip!" — legal on Windows, e.g. "notes.zip!backup.txt" — would be
// misidentified as an archive location. Not fixed: doing so would mean
// replacing "!" (a legal filename character) with something that can't
// collide, reworking every caller of this module. Left as a known, extremely
// unlikely edge case rather than reworked speculatively.
export function zipSplit(path: string): ZipLocation | null {
  const idx = path.toLowerCase().indexOf(MARKER);
  if (idx === -1) return null;
  const archivePath = path.slice(0, idx + EXT.length);
  const innerPath = path.slice(idx + MARKER.length).replace(/^[\\/]/, "");
  return { archivePath, innerPath };
}

export function isInsideZip(path: string): boolean {
  return zipSplit(path) !== null;
}

export function zipRootPath(archivePath: string): string {
  return `${archivePath}!`;
}

// The marker sits inside one real path segment (e.g. "archive.zip!") so
// lib/path.ts's dirname/basename/pathSegments stay unmodified — but that
// means any UI showing a raw segment/basename (breadcrumbs, tab labels,
// favorites) would otherwise leak the trailing "!" verbatim. Display-only:
// the real path used for navigation/storage is never touched by this.
// (Regex literal, not built from MARKER, so the escaped "\." stays visible
// and obviously correct at a glance — must match MARKER if that ever changes.)
export function stripZipMarkerSuffix(label: string): string {
  return /\.zip!$/i.test(label) ? label.slice(0, -1) : label;
}
