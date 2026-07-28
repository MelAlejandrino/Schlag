import { snippetParts } from "../lib/highlightSnippet";
import type { ContentSearchResult, Entry } from "../file-explorer.types";

// Content-search results flow through the same Entry[] listing as everything
// else, carrying their snippet fields along at runtime (see
// file-explorer.types.ts's ContentSearchResult) — EntryTable/EntryGrid read
// them back out through here rather than each casting on their own.
export function snippetOf(entry: Entry): ContentSearchResult | null {
  const candidate = entry as Partial<ContentSearchResult>;
  return candidate.snippet ? (candidate as ContentSearchResult) : null;
}

interface SnippetTextProps {
  result: ContentSearchResult;
  // Clamped, not scrolled — a match is a peek into the file, not the file.
  lines: number;
  // The strip's exact pinned height, so the virtualized row it sits in stays
  // a known size (see EntryTable/EntryGrid's estimateSize).
  height: number;
  className?: string;
}

// Set one step down from the filename (11px, the app's smallest metadata
// size) and in the variant ink, so a row still reads name-first and the
// quoted text stays clearly subordinate. Matches get a tinted accent wash
// instead of the browser's default yellow <mark>, which would be the single
// loudest thing on an otherwise restrained surface.
export function SnippetText({ result, lines, height, className = "" }: SnippetTextProps) {
  return (
    <p
      className={`overflow-hidden text-[11px] leading-[15px] text-on-surface-variant ${className}`}
      style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, height }}
      title={result.snippet}
    >
      {snippetParts(result.snippet, result.highlight_ranges).map((part, i) =>
        part.hit ? (
          <mark
            key={i}
            // box-decoration-break keeps the wash intact when a match wraps
            // across the clamp's line break instead of squaring off one end.
            style={{ boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}
            className="rounded-[2px] bg-primary/15 font-medium text-primary"
          >
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
