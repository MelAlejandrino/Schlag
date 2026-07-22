import type { Tag } from "../file-explorer.types";

// Shared tag-chip strip for EntryTable rows and EntryGrid tiles. Shows at most
// `max` chips, then a "+N" overflow chip (titled with the hidden tag names) so
// a heavily-tagged file doesn't blow out the row/tile width.
export function FileTagChips({
  tags,
  max = 2,
  className = "",
}: {
  tags: Tag[];
  max?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const hidden = tags.slice(max);

  return (
    <span className={className}>
      {shown.map((tag) => (
        <span
          key={tag.id}
          className="inline-block max-w-[7rem] truncate rounded px-1 py-0.5 text-[10px] font-medium leading-none"
          style={{ backgroundColor: tag.color + "33", color: tag.color, border: `1px solid ${tag.color}55` }}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {hidden.length > 0 && (
        <span
          className="inline-block rounded bg-surface-container-highest px-1 py-0.5 text-[10px] font-medium leading-none text-on-surface-variant"
          title={hidden.map((t) => t.name).join(", ")}
        >
          +{hidden.length}
        </span>
      )}
    </span>
  );
}
