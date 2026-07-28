export interface SnippetPart {
  text: string;
  hit: boolean;
}

// Content search returns a plain-text fragment plus UTF-16 offset ranges of
// the matched terms (content_index.rs converts Tantivy's byte offsets for
// us) — never HTML, so highlighting is plain string slicing rendered through
// ordinary auto-escaping JSX, no dangerouslySetInnerHTML anywhere.
//
// The fragment is raw file content: newlines, tabs, and indentation runs come
// through verbatim and render as ragged gaps, so runs of whitespace collapse
// to a single space here. That has to happen *after* splitting, not before —
// the ranges index into the original string, and rewriting it first would
// shift every offset. Out-of-bounds, empty, or overlapping ranges are skipped
// rather than throwing; nothing here trusts the input.
export function snippetParts(text: string, ranges: [number, number][]): SnippetPart[] {
  const raw: SnippetPart[] = [];
  let at = 0;
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (start < at || end > text.length || start >= end) continue;
    if (start > at) raw.push({ text: text.slice(at, start), hit: false });
    raw.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) raw.push({ text: text.slice(at), hit: false });

  // Collapse across part boundaries too, so "foo \n" + "bar" doesn't leave a
  // double space, and drop the leading/trailing whitespace of the fragment
  // as a whole (Tantivy cuts mid-document, often mid-indentation).
  const parts: SnippetPart[] = [];
  for (const part of raw) {
    let collapsed = part.text.replace(/\s+/g, " ");
    const previous = parts[parts.length - 1];
    if (collapsed.startsWith(" ") && (!previous || previous.text.endsWith(" "))) collapsed = collapsed.slice(1);
    if (collapsed) parts.push({ text: collapsed, hit: part.hit });
  }
  const last = parts[parts.length - 1];
  if (last && last.text.endsWith(" ")) last.text = last.text.trimEnd();
  return parts.filter((p) => p.text);
}
