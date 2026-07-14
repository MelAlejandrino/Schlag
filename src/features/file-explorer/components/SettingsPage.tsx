import { useEffect, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  Database,
  FolderSearch,
  Info,
  Palette,
  Plus,
  Settings,
  X,
} from "lucide-react";
import {
  useSettingsStore,
  type Accent,
  type SettingsSection,
  type StartupBehavior,
} from "../store/settings.store";
import type { SortKey } from "../lib/sortEntries";
import type { GroupBy } from "../lib/groupEntries";
import type { ViewMode } from "../store/file-explorer.store";

// ─── Design tokens ────────────────────────────────────────────────
// Every value here maps to a DESIGN.md token or an established pattern
// in SearchFiltersFields.tsx / SearchModal.tsx. Don't freestyle.

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface";

// Form fields — matches SearchFiltersFields' fieldClass exactly:
// rounded (8px), bg-surface-container, px-2 py-1, text-[12px].
const fieldClass =
  "w-full rounded border border-surface-container-highest bg-surface-container px-2 py-1 text-[12px] text-on-surface outline-none transition-colors duration-150 focus:border-primary-container";

// Section heading — the established "small chrome label" pattern:
// JetBrains Mono, 11px, uppercase, tracked, outline color.
const sectionHeading = "font-mono text-[11px] uppercase tracking-wide text-outline";

// ─── Reusable primitives ──────────────────────────────────────────

/** Two-sided pill switch — matches SearchModal's SegmentedToggle. */
function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded border border-surface-container-highest bg-surface-container p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex-1 rounded-[3px] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors duration-150 ${focusRing} ${
            value === opt.value
              ? "bg-primary-container/20 text-primary"
              : "text-outline hover:text-on-surface-variant"
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Small chip button — matches SearchFiltersFields' date-preset chips. */
function Chip({
  active,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-sm border px-2 py-0.5 text-[11px] transition-colors duration-150 ${focusRing} ${
        active
          ? "border-primary-container bg-primary-container/20 text-primary"
          : "border-surface-container-highest bg-surface-container text-outline hover:border-primary-container hover:text-on-surface"
      } ${disabled ? "cursor-default opacity-40" : "cursor-pointer"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Page section wrapper — consistent vertical rhythm between sections. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className={sectionHeading}>{title}</h3>
      {description && (
        <p className="max-w-[60ch] text-[12px] leading-relaxed text-on-surface-variant">{description}</p>
      )}
      {children}
    </section>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────

interface NavItem {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "about", label: "About Schlag", icon: Info },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "general", label: "General", icon: Settings },
  { id: "indexing", label: "Indexing", icon: FolderSearch },
  { id: "storage", label: "Storage", icon: Database },
  { id: "guide", label: "Guide", icon: BookOpen },
];

// ─── Page ─────────────────────────────────────────────────────────

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const store = useSettingsStore();

  useEffect(() => {
    store.loadSettings();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Left nav — fixed-width, same bg as app sidebar */}
      <nav className="themed-scroll w-52 shrink-0 overflow-y-auto border-r border-surface-container-highest bg-surface-container-lowest p-3">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = store.activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-[13px] transition-colors duration-150 ${focusRing} ${
                  active
                    ? "bg-primary-container/20 text-primary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
                onClick={() => store.setActiveSection(item.id)}
              >
                <Icon size={15} strokeWidth={1.75} className={active ? "text-primary" : "text-outline"} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Right content */}
      <div className="themed-scroll flex-1 overflow-y-auto p-6">
        <button
          type="button"
          onClick={onBack}
          className={`mb-6 flex items-center gap-1.5 rounded px-2 py-1 text-[12px] text-outline transition-colors duration-150 hover:bg-surface-container hover:text-on-surface ${focusRing}`}
        >
          <ArrowLeft size={14} strokeWidth={1.75} />
          Back to browsing
        </button>

        {store.activeSection === "about" && <AboutSection />}
        {store.activeSection === "appearance" && <AppearanceSection />}
        {store.activeSection === "general" && <GeneralSection />}
        {store.activeSection === "indexing" && <IndexingSection />}
        {store.activeSection === "storage" && <StorageSection />}
        {store.activeSection === "guide" && <GuideSection />}
      </div>
    </div>
  );
}

// ─── About ────────────────────────────────────────────────────────

function AboutSection() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">About Schlag</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          A modern, high-performance desktop file explorer.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/20">
          <Settings size={20} strokeWidth={1.75} className="text-primary" />
        </div>
        <div>
          <p className="text-[14px] font-medium text-on-surface">Schlag</p>
          <p className="font-mono text-[11px] text-outline">Version 0.1.0</p>
        </div>
      </div>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-on-surface-variant">
        Schlag indexes your files in the background, searches millions of entries instantly,
        previews documents without opening them, and provides power-user workflows — all in a
        native desktop experience powered by Tauri and React.
      </p>

      <Section title="Tech Stack">
        <div className="flex flex-wrap gap-1.5">
          {["Tauri", "Rust", "React", "TypeScript", "SQLite", "Tantivy"].map((tech) => (
            <span
              key={tech}
              className="rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 font-mono text-[11px] text-on-surface-variant"
            >
              {tech}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Appearance ───────────────────────────────────────────────────

// Swatch preview colors match the actual --color-primary-container value
// each accent applies (App.css) — the dot shows exactly what picking it
// does, not a stand-in mockup color.
const ACCENT_SWATCHES: { value: Accent; color: string; label: string }[] = [
  { value: "indigo", color: "#5856d6", label: "Cyber Indigo" },
  { value: "green", color: "#0c7219", label: "Green" },
  { value: "orange", color: "#b23f00", label: "Orange" },
  { value: "pink", color: "#c61e54", label: "Pink" },
];

function AppearanceSection() {
  const store = useSettingsStore();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">Appearance</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Customize how Schlag looks.
        </p>
      </div>

      <Section title="Theme">
        <SegmentToggle
          value={store.theme}
          onChange={store.setTheme}
          options={[
            { label: "Dark", value: "dark" as const },
            { label: "Light", value: "light" as const },
          ]}
        />
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Accent Color">
        <div className="flex gap-2">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.label}
              onClick={() => store.setAccent(c.value)}
              className={`h-7 w-7 rounded-full border-2 transition-all duration-150 ${focusRing} ${
                store.accent === c.value ? "border-on-surface scale-110" : "border-transparent opacity-40"
              }`}
              style={{ backgroundColor: c.color }}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── General ──────────────────────────────────────────────────────

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: "Name", value: "name" },
  { label: "Type", value: "type" },
  { label: "Size", value: "size" },
  { label: "Modified", value: "modified" },
];

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: "None", value: "none" },
  { label: "Type", value: "type" },
  { label: "Date", value: "modified" },
  { label: "Size", value: "size" },
];

const VIEW_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: "List", value: "list" },
  { label: "Medium", value: "medium" },
  { label: "Large", value: "large" },
];

function GeneralSection() {
  const store = useSettingsStore();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">General</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Startup behavior and default view settings.
        </p>
      </div>

      <Section title="Startup">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wide text-outline">On startup, open</span>
          <div className="flex gap-1.5">
            {(["this-pc", "last-folder", "custom"] as StartupBehavior[]).map((b) => (
              <Chip
                key={b}
                active={store.startupBehavior === b}
                onClick={() => store.setStartupBehavior(b)}
              >
                {b === "this-pc" ? "This PC" : b === "last-folder" ? "Last folder" : "Custom path"}
              </Chip>
            ))}
          </div>
        </div>
        {store.startupBehavior === "custom" && (
          <input
            className={fieldClass}
            placeholder="C:\\Users\\you\\Documents"
            value={store.startupPath}
            onChange={(e) => store.setStartupPath(e.currentTarget.value)}
          />
        )}
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Default View" description="Applied on next app launch. The current session keeps its own settings.">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-outline">Sort by</span>
            <SegmentToggle
              value={store.defaultSortKey}
              onChange={store.setDefaultSortKey}
              options={SORT_OPTIONS}
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wide text-outline">Direction</span>
              <SegmentToggle
                value={store.defaultSortDirection}
                onChange={store.setDefaultSortDirection}
                options={[
                  { label: "Ascending", value: "asc" },
                  { label: "Descending", value: "desc" },
                ]}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wide text-outline">Group by</span>
              <SegmentToggle
                value={store.defaultGroupBy}
                onChange={store.setDefaultGroupBy}
                options={GROUP_OPTIONS}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-outline">View mode</span>
            <SegmentToggle
              value={store.defaultViewMode}
              onChange={store.setDefaultViewMode}
              options={VIEW_OPTIONS}
            />
          </label>
        </div>
      </Section>
    </div>
  );
}

// ─── Indexing ─────────────────────────────────────────────────────

const BUILTIN_DIRS = ["node_modules", ".git", ".cache", "AppData", "target", ".cargo", ".npm", ".ssh"];

// is_excluded (indexer.rs) matches a single path component by name — a
// value containing a path separator can never match a real entry, so it
// would silently exclude nothing. Same reserved-character convention as
// promptConfig.ts's validateFilename, checked here instead of imported
// since this is a different concern (exclusion input, not a file/folder name).
const PATH_SEPARATOR = /[/\\]/;

// The inverse mistake for the path field below: a value with no drive
// prefix (a bare name, or a relative fragment) can never equal or prefix a
// real absolute path in is_excluded_path (indexer.rs), so it would silently
// exclude nothing — same "catch the silent no-op before it's saved" reasoning
// as PATH_SEPARATOR above. Windows-only app, so a drive-letter prefix is a
// reasonable absolute-path check (matches fs_ops.rs's own drive assumptions).
const ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;

/** Quiet sub-heading inside a Section — sans, smaller, dimmer than the
 * Section's own mono uppercase title, so "Built-in" / "Custom" read as a
 * second tier under it rather than a competing heading. */
function SubLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-medium text-outline-variant">{children}</span>;
}

/** A removable chip — matches the read-only built-in chip's shape but in
 * the primary tint, signaling "this one's yours." `wide` switches from a
 * wrapped inline chip (short names) to a full-width row (long paths, which
 * need to truncate instead of wrap). */
function RemovableChip({
  children,
  onRemove,
  wide,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  wide?: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1 rounded-sm border border-primary-container/40 bg-primary-container/10 font-mono text-[11px] text-primary ${
        wide ? "justify-between px-2 py-1" : "px-2 py-0.5"
      }`}
    >
      <span className={wide ? "truncate" : undefined}>{children}</span>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 transition-colors hover:bg-error-container hover:text-on-error-container"
        onClick={onRemove}
      >
        <X size={10} strokeWidth={2} />
      </button>
    </span>
  );
}

/** The shared "type a value, press Add" row + its inline validation error —
 * identical shape for both the directory-name and full-path fields below,
 * so the two exclusion mechanisms read as one consistent affordance. */
function AddRow({
  value,
  onChange,
  onKeyDown,
  onAdd,
  placeholder,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onAdd: () => void;
  placeholder: string;
  error: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-surface-container-highest pt-3">
      <div className="flex gap-2">
        <input
          className={`flex-1 ${fieldClass}`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={`flex shrink-0 items-center gap-1 rounded border border-surface-container-highest bg-surface-container px-2.5 py-1 text-[11px] text-on-surface transition-colors duration-150 hover:border-primary-container ${focusRing}`}
          onClick={onAdd}
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>
      {error && <p className="text-[11px] text-error">{error}</p>}
    </div>
  );
}

function IndexingSection() {
  const store = useSettingsStore();
  const [newDir, setNewDir] = useState("");
  const [dirError, setDirError] = useState("");
  const [newPath, setNewPath] = useState("");
  const [pathError, setPathError] = useState("");

  function handleAddDir() {
    const trimmed = newDir.trim();
    if (PATH_SEPARATOR.test(trimmed)) {
      setDirError("Enter a directory name only, not a path (e.g. .venv, not C:\\foo\\.venv).");
      return;
    }
    store.addExcludedDir(trimmed);
    setNewDir("");
    setDirError("");
  }

  function handleDirKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDir();
    }
  }

  function handleAddPath() {
    const trimmed = newPath.trim();
    if (!ABSOLUTE_PATH.test(trimmed)) {
      setPathError("Enter a full path, e.g. D:\\Downloads\\ISOs.");
      return;
    }
    store.addExcludedPath(trimmed);
    setNewPath("");
    setPathError("");
  }

  function handlePathKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPath();
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">Indexing</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Control which directories are excluded from the file index.
        </p>
      </div>

      <Section
        title="Excluded Directories"
        description="Directory names to exclude from indexing, on top of the built-in list. Changes take effect on next app restart."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <SubLabel>Built-in</SubLabel>
            <div className="flex flex-wrap gap-1.5">
              {BUILTIN_DIRS.map((name) => (
                <span
                  key={name}
                  className="rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 font-mono text-[11px] text-outline-variant"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SubLabel>Custom</SubLabel>
            {store.excludedDirs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {store.excludedDirs.map((name) => (
                  <RemovableChip key={name} onRemove={() => store.removeExcludedDir(name)}>
                    {name}
                  </RemovableChip>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-outline">Nothing added yet — add a name below.</p>
            )}
          </div>
        </div>

        <AddRow
          value={newDir}
          onChange={(v) => {
            setNewDir(v);
            if (dirError) setDirError("");
          }}
          onKeyDown={handleDirKeyDown}
          onAdd={handleAddDir}
          placeholder="directory name (e.g. .venv)"
          error={dirError}
        />
      </Section>

      <hr className="border-surface-container-highest" />

      <Section
        title="Excluded Paths"
        description="Specific folder locations to exclude from indexing, regardless of name. Changes take effect on next app restart."
      >
        {store.excludedPaths.length > 0 ? (
          <div className="themed-scroll flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
            {store.excludedPaths.map((path) => (
              <RemovableChip key={path} onRemove={() => store.removeExcludedPath(path)} wide>
                {path}
              </RemovableChip>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-outline">
            No folders excluded by path yet — useful for skipping one specific location without
            excluding every folder that happens to share its name.
          </p>
        )}

        <AddRow
          value={newPath}
          onChange={(v) => {
            setNewPath(v);
            if (pathError) setPathError("");
          }}
          onKeyDown={handlePathKeyDown}
          onAdd={handleAddPath}
          placeholder="full path (e.g. D:\\Downloads\\ISOs)"
          error={pathError}
        />
      </Section>
    </div>
  );
}

// ─── Storage ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StorageSection() {
  const store = useSettingsStore();

  useEffect(() => {
    store.loadStorageInfo();
  }, []);

  const info = store.storageInfo;

  const cards = info
    ? [
        { label: "Indexed entries", value: info.indexed_entry_count.toLocaleString() },
        { label: "Filename index", value: formatBytes(info.index_db_bytes) },
        { label: "Content index", value: formatBytes(info.content_index_bytes) },
        { label: "Settings file", value: formatBytes(info.settings_file_bytes) },
      ]
    : null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">Storage</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          How Schlag stores its data on your system.
        </p>
      </div>

      <Section title="Index">
        {cards ? (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((item) => (
              <div
                key={item.label}
                className="flex flex-col gap-1 rounded border border-surface-container-highest bg-surface-container p-3"
              >
                <span className="font-mono text-[11px] uppercase tracking-wide text-outline">{item.label}</span>
                <span className="text-[14px] font-medium text-on-surface">{item.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-outline">Loading…</p>
        )}
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Data Location">
        <div className="rounded border border-surface-container-highest bg-surface-container px-3 py-2">
          <p className="font-mono text-[12px] text-on-surface-variant">%APPDATA%\com.carlo.schlag</p>
        </div>
        <p className="max-w-[60ch] text-[11px] leading-relaxed text-outline">
          The filename index, content index, and settings file are stored here.
          Deleting this folder resets all indexed data and settings.
        </p>
      </Section>
    </div>
  );
}

// ─── Guide ────────────────────────────────────────────────────────

function GuideSection() {
  const shortcuts = [
    { keys: "Ctrl+Tab / Ctrl+Shift+Tab", desc: "Switch tabs forward / backward" },
    { keys: "Ctrl+T", desc: "New tab" },
    { keys: "Ctrl+W", desc: "Close tab" },
    { keys: "Ctrl+F", desc: "Search" },
    { keys: "Ctrl+L", desc: "Focus address bar" },
    { keys: "Ctrl+N", desc: "New folder" },
    { keys: "Ctrl+D", desc: "Toggle favorite" },
    { keys: "Ctrl+P", desc: "Toggle preview pane" },
    { keys: "Ctrl+R", desc: "Refresh" },
    { keys: "Ctrl+C / X / V", desc: "Copy / Cut / Paste" },
    { keys: "Ctrl+,", desc: "Open settings" },
    { keys: "Space", desc: "Toggle preview pane" },
    { keys: "F2", desc: "Rename selected" },
    { keys: "Delete", desc: "Delete selected" },
    { keys: "Escape", desc: "Close preview / clear selection" },
    { keys: "Arrow keys", desc: "Navigate entries" },
    { keys: "Home / End", desc: "Jump to first / last" },
    { keys: "Enter", desc: "Open selected" },
    { keys: "A–Z", desc: "Type-ahead jump to file" },
  ];

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">Guide</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Tips and keyboard shortcuts for getting the most out of Schlag.
        </p>
      </div>

      <Section title="Keyboard Shortcuts">
        <div className="flex flex-col">
          {shortcuts.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between rounded px-2 py-1.5 transition-colors duration-150 hover:bg-surface-container"
            >
              <span className="text-[12px] text-on-surface-variant">{s.desc}</span>
              <kbd className="rounded-sm border border-surface-container-highest bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Tips">
        <div className="flex flex-col gap-1.5">
          {[
            "Right-click any file or folder for a context menu with quick actions.",
            "Drag files between tabs — hover over a tab to switch, then drop.",
            "Use the search modal's folder scope to search within the current directory.",
            "Content search indexes text inside PDFs, Office docs, Markdown, and code files.",
            "The preview pane supports images, video, PDF, Markdown, text, Office, and ZIP archives.",
            "Group entries by type, date, or size using the View menu in the toolbar.",
            "Star a folder to add it to your Favorites in the sidebar.",
          ].map((tip, i) => (
            <p key={i} className="flex gap-2 text-[12px] leading-relaxed text-on-surface-variant">
              <span className="mt-0.5 shrink-0 text-primary">•</span>
              <span className="max-w-[60ch]">{tip}</span>
            </p>
          ))}
        </div>
      </Section>
    </div>
  );
}
