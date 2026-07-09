// ponytail: no path-join/dirname crate or plugin permission needed —
// entries already carry full paths, this only builds new child paths.
export function sepOf(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

export function joinPath(base: string, name: string): string {
  const sep = sepOf(base);
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export function dirname(path: string): string {
  const sep = sepOf(path);
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf(sep);
  if (idx <= 0) return trimmed.slice(0, idx + 1);
  const parent = trimmed.slice(0, idx);
  // a bare drive letter ("C:") is a relative path in Windows, not its root —
  // put the separator back so going up twice lands on "C:\", not "C:".
  return /^[A-Za-z]:$/.test(parent) ? parent + sep : parent;
}

export function basename(path: string): string {
  const sep = sepOf(path);
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf(sep) + 1);
}

export function isPathWithin(path: string, base: string): boolean {
  const sep = sepOf(base);
  return path === base || path.startsWith(base.endsWith(sep) ? base : base + sep);
}

export interface PathSegment {
  label: string;
  path: string;
}

// Cumulative breadcrumb chain: "C:\Users\carlo" -> [C: -> C:\, Users -> C:\Users, carlo -> C:\Users\carlo]
export function pathSegments(path: string): PathSegment[] {
  const sep = sepOf(path);
  const trimmed = path.endsWith(sep) ? path.slice(0, -1) : path;
  const parts = trimmed.split(sep).filter(Boolean);
  return parts.map((label, i) => ({
    label,
    path: i === 0 ? label + sep : parts.slice(0, i + 1).join(sep),
  }));
}

// Picks the most specific (deepest) candidate containing currentPath, so
// nested sidebar entries (e.g. Home containing Downloads) don't both light up.
export function longestMatchingPath(currentPath: string, candidates: string[]): string | null {
  let best: string | null = null;
  for (const candidate of candidates) {
    if (isPathWithin(currentPath, candidate) && (best === null || candidate.length > best.length)) {
      best = candidate;
    }
  }
  return best;
}

// Favorites are stored as bare paths; views that render them as named
// tiles/links (matching QuickAccessDir's shape) derive the name from the path.
export function toNamedPaths(paths: string[]): { name: string; path: string }[] {
  return paths.map((path) => ({ name: basename(path), path }));
}
