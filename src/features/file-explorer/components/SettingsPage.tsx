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
import { useSettingsStore, type SettingsSection, type StartupBehavior } from "../store/settings.store";
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

function AppearanceSection() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">Appearance</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Customize how Schlag looks.
        </p>
      </div>

      <Section title="Theme" description="Schlag currently uses a dark theme only. Light theme is coming in a future update.">
        <SegmentToggle
          value="dark"
          onChange={() => {}}
          options={[
            { label: "Dark", value: "dark" as const },
            { label: "Light (coming soon)", value: "light" as const },
          ]}
        />
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Accent Color" description="Custom accent colors are coming in a future update.">
        <div className="flex gap-2">
          {[
            { color: "#5856d6", label: "Cyber Indigo" },
            { color: "#4caf50", label: "Green" },
            { color: "#ff9800", label: "Orange" },
            { color: "#e91e63", label: "Pink" },
          ].map((c) => (
            <button
              key={c.color}
              type="button"
              title={c.label}
              className={`h-7 w-7 rounded-full border-2 transition-all duration-150 ${focusRing} ${
                c.color === "#5856d6"
                  ? "border-on-surface scale-110"
                  : "border-transparent opacity-40"
              }`}
              style={{ backgroundColor: c.color }}
              disabled={c.color !== "#5856d6"}
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

function IndexingSection() {
  const store = useSettingsStore();
  const [newDir, setNewDir] = useState("");

  function handleAddDir() {
    store.addExcludedDir(newDir);
    setNewDir("");
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddDir();
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
        {/* Built-in exclusions (read-only) */}
        <div className="flex flex-wrap gap-1.5">
          {BUILTIN_DIRS.map((name) => (
            <span
              key={name}
              className="rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 font-mono text-[11px] text-outline-variant"
            >
              {name}
            </span>
          ))}
          <span className="flex items-center px-1 font-mono text-[11px] text-outline">(built-in)</span>
        </div>

        {/* User-added exclusions */}
        {store.excludedDirs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {store.excludedDirs.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 rounded-sm border border-primary-container/40 bg-primary-container/10 px-2 py-0.5 font-mono text-[11px] text-primary"
              >
                {name}
                <button
                  type="button"
                  className="rounded p-0.5 transition-colors hover:bg-error-container hover:text-on-error-container"
                  onClick={() => store.removeExcludedDir(name)}
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add new */}
        <div className="flex gap-2">
          <input
            className={`flex-1 ${fieldClass}`}
            placeholder="directory name (e.g. .venv)"
            value={newDir}
            onChange={(e) => setNewDir(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className={`flex shrink-0 items-center gap-1 rounded border border-surface-container-highest bg-surface-container px-2.5 py-1 text-[11px] text-on-surface transition-colors duration-150 hover:border-primary-container ${focusRing}`}
            onClick={handleAddDir}
          >
            <Plus size={12} strokeWidth={2} />
            Add
          </button>
        </div>
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
