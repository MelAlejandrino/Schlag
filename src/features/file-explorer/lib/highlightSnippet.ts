export interface SnippetSegment {
  text: string;
  highlighted: boolean;
}

// Splits `text` into alternating plain/highlighted segments from [start, end)
// UTF-16 code-unit ranges (the backend already converts Tantivy's byte
// offsets to UTF-16 before this ever reaches the frontend — see
// content_index.rs's byte_ranges_to_utf16). Pure derivation kept out of JSX
// so it's trivially testable and so nothing here ever needs
// dangerouslySetInnerHTML: the snippet is raw file content the app doesn't
// control, and Tantivy's own Snippet::to_html() doesn't escape it.
export function splitHighlights(text: string, ranges: [number, number][]): SnippetSegment[] {
  if (ranges.length === 0) return [{ text, highlighted: false }];

  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const segments: SnippetSegment[] = [];
  let cursor = 0;

  for (const [start, end] of sorted) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false });
    if (end > cursor) {
      segments.push({ text: text.slice(Math.max(cursor, start), end), highlighted: true });
      cursor = end;
    }
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });

  return segments;
}
