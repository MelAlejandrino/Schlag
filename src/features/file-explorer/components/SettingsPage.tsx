import { useEffect, useState, type KeyboardEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { OWNER_URL, REPO_NAME, REPO_OWNER, REPO_URL } from "../lib/repo";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  ArrowLeft,
  BookOpen,
  Database,
  FolderSearch,
  GitFork,
  Info,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  User,
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
import { useUpdater } from "../lib/useUpdater";
import { fileExplorerService } from "../services/file-explorer.service";

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
// monospace, 11px, uppercase, tracked, outline color.
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
  { id: "whats-new", label: "What's New", icon: Sparkles },
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
        {store.activeSection === "whats-new" && <WhatsNewSection />}
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

function LinkRow({
  icon: Icon,
  label,
  url,
}: {
  icon: typeof GitFork;
  label: string;
  url: string;
}) {
  return (
    <button
      type="button"
      onClick={() => fileExplorerService.openUrl(url)}
      className={`flex w-fit items-center gap-2 rounded px-1 py-0.5 text-[12px] text-on-surface-variant transition-colors duration-150 hover:text-primary ${focusRing}`}
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function AboutSection() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

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
          <p className="font-mono text-[11px] text-outline">Version {version || "…"}</p>
        </div>
      </div>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-on-surface-variant">
        Schlag indexes your files in the background, searches millions of entries instantly,
        and provides power-user workflows — all in a native desktop experience powered by Tauri
        and React.
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

      <hr className="border-surface-container-highest" />

      <Section title="Links">
        <div className="flex flex-col gap-1.5">
          <LinkRow
            icon={GitFork}
            label={`${REPO_NAME} on GitHub`}
            url={REPO_URL}
          />
          <LinkRow
            icon={User}
            label={`Developer: ${REPO_OWNER}`}
            url={OWNER_URL}
          />
        </div>
      </Section>
    </div>
  );
}

// ─── What's New ─────────────────────────────────────────────────

import changelogRaw from "../../../../CHANGELOG.md?raw";

type ChangeCategory = "added" | "fixed" | "changed" | "removed";

interface ReleaseEntry {
  version: string;
  date: string;
  added?: string[];
  fixed?: string[];
  changed?: string[];
  removed?: string[];
}

const CATEGORY_LABELS: Record<ChangeCategory, string> = {
  added: "Added",
  fixed: "Fixed",
  changed: "Changed",
  removed: "Removed",
};

const CATEGORY_ORDER: ChangeCategory[] = ["added", "fixed", "changed", "removed"];

const PARSED_RELEASES: ReleaseEntry[] = (() => {
  const releases: ReleaseEntry[] = [];
  let current: ReleaseEntry | null = null;
  let currentCategory: ChangeCategory | null = null;

  for (const line of changelogRaw.split("\n")) {
    const versionMatch = line.match(/^## \[(.+?)\] - (.+)$/);
    if (versionMatch) {
      current = { version: versionMatch[1], date: versionMatch[2] };
      releases.push(current);
      currentCategory = null;
      continue;
    }

    if (current) {
      const catMatch = line.match(/^### (\w+)$/i);
      if (catMatch) {
        const lower = catMatch[1].toLowerCase() as ChangeCategory;
        if (CATEGORY_LABELS[lower]) {
          currentCategory = lower;
          if (!current[currentCategory]) current[currentCategory] = [];
        }
        continue;
      }

      if (currentCategory && current[currentCategory]) {
        const bulletMatch = line.match(/^- (.+)$/);
        if (bulletMatch) {
          current[currentCategory]!.push(bulletMatch[1]);
        }
      }
    }
  }

  return releases;
})();

/** Renders a string, turning **bold** segments into <strong> elements. */
function renderBold(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-medium text-on-surface">
        {match[1]}
      </strong>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function WhatsNewSection() {
  const [version, setVersion] = useState("");
  const updater = useUpdater();

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-semibold text-on-surface">What's New</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-on-surface-variant">
          Check for updates and see what's changed in each release.
        </p>
      </div>

      <Section title="Current Version">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/20">
            <Sparkles size={20} strokeWidth={1.75} className="text-primary" />
          </div>
          <div>
            <p className="text-[14px] font-medium text-on-surface">Schlag</p>
            <p className="font-mono text-[11px] text-outline">Version {version || "…"}</p>
          </div>
        </div>
      </Section>

      <Section title="Updates">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={updater.status === "checking" || updater.status === "downloading"}
            onClick={updater.checkForUpdate}
            className={`flex items-center gap-1.5 rounded border border-surface-container-highest bg-surface-container px-2.5 py-1 text-[11px] text-on-surface transition-colors duration-150 hover:border-primary-container disabled:cursor-default disabled:opacity-50 ${focusRing}`}
          >
            {updater.status === "checking" ? (
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            ) : (
              <RefreshCw size={12} strokeWidth={2} />
            )}
            Check for Updates
          </button>

          {updater.status === "up-to-date" && (
            <span className="text-[12px] text-on-surface-variant">You're on the latest version.</span>
          )}
          {updater.status === "error" && (
            <span className="text-[12px] text-error">{updater.error}</span>
          )}
        </div>

        {updater.status === "available" && updater.update && (
          <div className="flex flex-col gap-2 rounded border border-primary-container/40 bg-primary-container/10 p-3">
            <p className="text-[12px] text-on-surface">
              Version {updater.update.version} is available (you have {updater.update.currentVersion}).
            </p>
            <button
              type="button"
              onClick={updater.downloadAndInstall}
              className={`w-fit rounded bg-primary-container px-2.5 py-1 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-primary-container/90 ${focusRing}`}
            >
              Download and Install
            </button>
          </div>
        )}

        {updater.status === "downloading" && (
          <p className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
            <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            Downloading update…
          </p>
        )}

        {updater.status === "ready" && (
          <div className="flex flex-col gap-2 rounded border border-primary-container/40 bg-primary-container/10 p-3">
            <p className="text-[12px] text-on-surface">Update downloaded — restart to finish installing.</p>
            <button
              type="button"
              onClick={updater.relaunch}
              className={`w-fit rounded bg-primary-container px-2.5 py-1 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-primary-container/90 ${focusRing}`}
            >
              Restart Now
            </button>
          </div>
        )}
      </Section>

      <hr className="border-surface-container-highest" />

      <Section title="Changelog">
        <div className="flex flex-col gap-5">
          {PARSED_RELEASES.map((release) => (
            <div key={release.version} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[13px] font-medium text-on-surface">v{release.version}</span>
                <span className="text-[11px] text-outline">{release.date}</span>
              </div>

              {CATEGORY_ORDER.map((cat) => {
                const items = release[cat];
                if (!items || items.length === 0) return null;
                return (
                  <div key={cat} className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-primary">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <ul className="flex flex-col gap-0.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-on-surface-variant">
                          <span className="mt-1.5 shrink-0 h-1 w-1 rounded-full bg-primary" />
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
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
            { label: "System", value: "system" as const },
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

      <Section title="Default View" description="Applies immediately, and becomes the default for future launches.">
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

// is_excluded (indexer.rs) matches a single path component by name — a
// value containing a path separator can never match a real entry, so it
// would silently exclude nothing. Same reserved-character convention as
// promptConfig.ts's validateFilename, checked here instead of imported
// since this is a different concern (exclusion input, not a file/folder name).
const PATH_SEPARATOR = /[/\\]/;

// The built-in list (indexer.rs's EXCLUDED_DIR_NAMES) is ~75 entries —
// showing all of them inline turned the Section into a wall of chips.
// Preview a handful and push the rest behind a "+N more" button/modal
// instead, same "don't show everything at once" call already made for
// EntryGrid/EntryTable's virtualization, just at a much smaller scale here.
const BUILT_IN_PREVIEW_COUNT = 14;

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

/** The full built-in exclusion list, behind the "+N more" button below —
 * same backdrop/dialog shape as ConfirmModal (Escape-to-close, click-outside
 * dismiss), just listing rather than confirming, so no destructive-action
 * styling. Not a shared component with ConfirmModal — considered and
 * declined, same "different content shapes" call already made for
 * ViewMenu/ContextMenu in FileExplorerView's own architecture notes. */
function BuiltInDirsModal({ dirs, onClose }: { dirs: string[]; onClose: () => void }) {
  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="built-in-dirs-modal-title"
        className="animate-dialog-in flex max-h-[70vh] w-96 flex-col gap-3 rounded-lg border border-surface-container-highest bg-surface-container-high p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-center justify-between gap-2">
          <span id="built-in-dirs-modal-title" className="text-[13px] font-medium text-on-surface">
            Built-in excluded directories ({dirs.length})
          </span>
          <button
            type="button"
            className={`shrink-0 rounded p-1 text-outline transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing}`}
            onClick={onClose}
            autoFocus
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="themed-scroll flex flex-wrap gap-1.5 overflow-y-auto">
          {dirs.map((name) => (
            <span
              key={name}
              className="rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 font-mono text-[11px] text-outline-variant"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
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
  const [showAllBuiltIn, setShowAllBuiltIn] = useState(false);
  // Exclusions only take effect on the next scan, which only ever runs at
  // startup (indexer.rs) — this session-local flag surfaces a restart
  // prompt right where the change was made, instead of leaving the user to
  // remember the "Changes take effect on next app restart" copy above.
  const [restartNeeded, setRestartNeeded] = useState(false);

  function handleAddDir() {
    const trimmed = newDir.trim();
    if (PATH_SEPARATOR.test(trimmed)) {
      setDirError("Enter a directory name only, not a path (e.g. .venv, not C:\\foo\\.venv).");
      return;
    }
    const lower = trimmed.toLowerCase();
    if (store.builtInExcludedDirs.some((d) => d.toLowerCase() === lower)) {
      setDirError(`"${trimmed}" is already excluded by default — no need to add it again.`);
      return;
    }
    if (store.excludedDirs.includes(lower)) {
      setDirError(`"${trimmed}" is already in your custom list.`);
      return;
    }
    store.addExcludedDir(trimmed);
    setNewDir("");
    setDirError("");
    setRestartNeeded(true);
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
    // Exact-path match only (trailing separator/casing aside) — same
    // normalization addExcludedPath itself already dedupes against, just
    // checked here first so a duplicate gets a real inline error instead of
    // addExcludedPath's silent no-op.
    const normalized = trimmed.replace(/[\\/]+$/, "").toLowerCase();
    if (store.excludedPaths.some((p) => p.replace(/[\\/]+$/, "").toLowerCase() === normalized)) {
      setPathError(`"${trimmed}" is already excluded.`);
      return;
    }
    store.addExcludedPath(trimmed);
    setNewPath("");
    setPathError("");
    setRestartNeeded(true);
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

      {restartNeeded && (
        <div className="flex items-center justify-between gap-3 rounded border border-primary-container/40 bg-primary-container/10 px-3 py-2">
          <p className="text-[12px] text-on-surface">Restart Schlag to apply your exclusion changes.</p>
          <button
            type="button"
            onClick={() => relaunch()}
            className={`flex shrink-0 items-center gap-1.5 rounded bg-primary-container px-2.5 py-1 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-primary-container/90 ${focusRing}`}
          >
            <RefreshCw size={12} strokeWidth={2} />
            Restart Now
          </button>
        </div>
      )}

      <Section
        title="Excluded Directories"
        description="Directory names to exclude from indexing, on top of the built-in list. Changes take effect on next app restart."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <SubLabel>Built-in</SubLabel>
            <div className="flex flex-wrap items-center gap-1.5">
              {store.builtInExcludedDirs.slice(0, BUILT_IN_PREVIEW_COUNT).map((name) => (
                <span
                  key={name}
                  className="rounded-sm border border-surface-container-highest bg-surface-container px-2 py-0.5 font-mono text-[11px] text-outline-variant"
                >
                  {name}
                </span>
              ))}
              {store.builtInExcludedDirs.length > BUILT_IN_PREVIEW_COUNT && (
                <button
                  type="button"
                  className={`rounded-sm px-2 py-0.5 text-[11px] text-outline underline-offset-2 transition-colors duration-150 hover:text-on-surface hover:underline ${focusRing}`}
                  onClick={() => setShowAllBuiltIn(true)}
                >
                  +{store.builtInExcludedDirs.length - BUILT_IN_PREVIEW_COUNT} more
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <SubLabel>Custom</SubLabel>
            {store.excludedDirs.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {store.excludedDirs.map((name) => (
                  <RemovableChip
                    key={name}
                    onRemove={() => {
                      store.removeExcludedDir(name);
                      setRestartNeeded(true);
                    }}
                  >
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
              <RemovableChip
                key={path}
                onRemove={() => {
                  store.removeExcludedPath(path);
                  setRestartNeeded(true);
                }}
                wide
              >
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

      {showAllBuiltIn && (
        <BuiltInDirsModal dirs={store.builtInExcludedDirs} onClose={() => setShowAllBuiltIn(false)} />
      )}
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
    { keys: "Ctrl+R", desc: "Refresh" },
    { keys: "Ctrl+C / X / V", desc: "Copy / Cut / Paste" },
    { keys: "Ctrl+,", desc: "Open settings" },
    { keys: "F2", desc: "Rename selected" },
    { keys: "Delete", desc: "Delete selected" },
    { keys: "Escape", desc: "Clear selection" },
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
