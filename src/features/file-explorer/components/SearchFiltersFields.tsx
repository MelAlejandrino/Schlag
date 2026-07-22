import { useState } from "react";
import { X } from "lucide-react";
import type { SearchFilters } from "../file-explorer.types";
import { basename } from "../lib/path";
import { Combobox } from "./Combobox";

// Extension values match what the backend actually stores (Rust's
// Path::extension(), no leading dot) — see indexer.rs's make_row().
const COMMON_EXTENSIONS = [
  "txt",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "md",
  "jpg",
  "png",
  "gif",
  "svg",
  "mp4",
  "mp3",
  "zip",
  "json",
  "html",
  "js",
  "ts",
  "py",
];

export function countActiveFilters(filters: SearchFilters): number {
  return Object.values(filters).filter((v) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

const fieldClass =
  "w-full rounded border border-surface-container-highest bg-surface-container px-2 py-1 text-[12px] text-on-surface outline-none focus:border-primary-container";
// Matches EntryTable's column-header treatment (font-mono, uppercase,
// tracked) — the established "small chrome label" pattern in this app,
// reused here instead of inventing a one-off label style.
const labelClass = "font-mono text-[11px] uppercase tracking-wide text-outline";

// Rust's min_size/max_size are u64 — a negative or fractional value would
// fail to deserialize at the Tauri IPC boundary and surface as a search
// error, even though the <input type="number"> has no built-in min/step
// enforcement against typed or pasted values.
function parseNonNegative(value: string): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : undefined;
}

function dateToMs(value: string): number | undefined {
  return value ? new Date(value).getTime() : undefined;
}

function msToDate(ms: number | undefined): string {
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// The suggestion list shows "Documents (C:\Users\carlo\Documents)" instead
// of the bare path — full paths are hard to scan at a glance in a dropdown,
// especially once several suggestions share a long common prefix. The
// Combobox's actual value stays the real path either way (see its
// getOptionLabel doc comment) — this only changes what's displayed.
function folderOptionLabel(path: string): string {
  const name = basename(path);
  return name ? `${name} (${path})` : path;
}

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "Year", days: 365 },
];

interface DateRangeFilterProps {
  afterMs: number | undefined;
  beforeMs: number | undefined;
  onChange: (afterMs: number | undefined, beforeMs: number | undefined) => void;
}

// Purpose-built for this one filter rather than two bare <input type="date">
// side by side: quick presets for the common case, a single visually-grouped
// range control for the exact case. Doesn't reinvent date *picking* itself —
// that stays the platform's native picker (color-scheme: dark so its popup
// isn't a jarring white square against this otherwise dark UI), just the
// surrounding composition.
function DateRangeFilter({ afterMs, beforeMs, onChange }: DateRangeFilterProps) {
  const chipClass =
    `rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 text-[11px] text-outline ` +
    `transition-colors duration-150 hover:border-primary-container hover:text-on-surface ${focusRing}`;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelClass}>Modified</span>
      <div className="flex flex-wrap gap-1">
        {DATE_PRESETS.map(({ label, days }) => (
          <button
            key={label}
            type="button"
            className={chipClass}
            onClick={() => onChange(days === 0 ? startOfToday() : Date.now() - days * 86_400_000, undefined)}
          >
            {label}
          </button>
        ))}
        {(afterMs !== undefined || beforeMs !== undefined) && (
          <button type="button" className={chipClass} onClick={() => onChange(undefined, undefined)}>
            <X size={11} strokeWidth={2} className="inline -mt-px" /> Clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 rounded border border-surface-container-highest bg-surface-container px-2 py-1 transition-colors duration-150 focus-within:border-primary-container">
        <input
          type="date"
          className="w-full min-w-0 bg-transparent text-[12px] text-on-surface outline-none [color-scheme:dark]"
          value={msToDate(afterMs)}
          onChange={(e) => onChange(dateToMs(e.currentTarget.value), beforeMs)}
        />
        <span className="shrink-0 text-outline">→</span>
        <input
          type="date"
          className="w-full min-w-0 bg-transparent text-[12px] text-on-surface outline-none [color-scheme:dark]"
          value={msToDate(beforeMs)}
          onChange={(e) => onChange(afterMs, dateToMs(e.currentTarget.value))}
        />
      </div>
    </div>
  );
}

interface SearchFiltersFieldsProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  folderSuggestions: string[];
  tags: { id: number; name: string; color: string }[];
}

// Inline filter fields — no floating-popover positioning, unlike the
// SearchBox-era SearchFiltersPanel this replaces. SearchModal renders this
// directly in its own document flow as a closed-by-default disclosure, so
// there's no anchor/clamp math to do here at all.
export function SearchFiltersFields({ filters, onChange, folderSuggestions, tags }: SearchFiltersFieldsProps) {
  function set<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const selectedTags = filters.tags ?? [];

  function addTag(name: string) {
    if (!name.trim() || selectedTags.includes(name.trim())) return;
    set("tags", [...selectedTags, name.trim()]);
  }

  function removeTag(name: string) {
    set("tags", selectedTags.filter((t) => t !== name));
  }

  return (
    <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto px-4 py-3">
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelClass}>Extension</span>
          <Combobox
            className={fieldClass}
            placeholder="txt, png..."
            options={COMMON_EXTENSIONS}
            value={filters.extension ?? ""}
            onChange={(v) => set("extension", v || undefined)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelClass}>Folder</span>
          <Combobox
            className={fieldClass}
            placeholder="C:\Users\..."
            options={folderSuggestions}
            value={filters.folder ?? ""}
            onChange={(v) => set("folder", v || undefined)}
            getOptionLabel={folderOptionLabel}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className={labelClass}>Tags</span>
        <div className="flex flex-wrap gap-1">
      {selectedTags.map((tag) => {
        const found = tags.find((t) => t.name === tag);
        return (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: (found?.color ?? "#888888") + "33", color: found?.color ?? "#888888", border: `1px solid ${found?.color ?? "#888888"}55` }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 rounded hover:bg-white/10"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        );
      })}
      <TagAdder tags={tags} selectedTags={selectedTags} onAdd={addTag} />
    </div>
  </div>

  <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelClass}>Min size (bytes)</span>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={filters.min_size ?? ""}
            onChange={(e) => set("min_size", parseNonNegative(e.currentTarget.value))}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className={labelClass}>Max size (bytes)</span>
          <input
            type="number"
            min={0}
            className={fieldClass}
            value={filters.max_size ?? ""}
            onChange={(e) => set("max_size", parseNonNegative(e.currentTarget.value))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>Regex</span>
        <input
          className={fieldClass}
          placeholder="^report_\d+"
          value={filters.regex ?? ""}
          onChange={(e) => set("regex", e.currentTarget.value || undefined)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <DateRangeFilter
          afterMs={filters.modified_after_ms}
          beforeMs={filters.modified_before_ms}
          onChange={(after, before) =>
            onChange({ ...filters, modified_after_ms: after, modified_before_ms: before })
          }
        />
      </div>
    </div>
  );
}

interface TagAdderProps {
  tags: { id: number; name: string; color: string }[];
  selectedTags: string[];
  onAdd: (name: string) => void;
}

function TagAdder({ tags, selectedTags, onAdd }: TagAdderProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  function commit() {
    const name = value.trim();
    if (!name) return;
    onAdd(name);
    setValue("");
    setOpen(false);
  }

  const suggestions = tags.filter((t) => t.name.toLowerCase().includes(value.toLowerCase()) && !selectedTags.includes(t.name));

  return (
    <div className="relative">
      <input
        className={`${fieldClass} min-w-[120px] flex-1`}
        placeholder="Add tag…"
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      {open && suggestions.length > 0 && (
        <div className="themed-scroll absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-36 overflow-y-auto rounded-md border border-surface-container-highest bg-surface-container-high py-1 shadow-lg">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onAdd(tag.name);
                setValue("");
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[12px] text-on-surface transition-colors duration-100 hover:bg-surface-container-highest"
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
