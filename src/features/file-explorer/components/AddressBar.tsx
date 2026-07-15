import { useEffect, useRef, useState } from "react";
import { Monitor, MoreHorizontal, Pencil, Star } from "lucide-react";
import { useBreadcrumbOverflow } from "../lib/useBreadcrumbOverflow";
import { stripZipMarkerSuffix } from "../lib/zipPath";

interface AddressBarProps {
  currentPath: string;
  isThisPC: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onNavigate: (path: string) => void;
  // Incremented by Ctrl+L to request focus — AddressBar enters edit
  // mode when this changes, same one-shot-signal pattern as revealPath.
  focusRequest?: number;
  // Favoriting the browsed folder — moved in from Toolbar's own standalone
  // Star button so it reads as a browser-omnibox bookmark star (Chrome/Arc's
  // own address-bar affordance) instead of a same-weight sibling of every
  // other toolbar icon. Only rendered in the non-editing view (like the
  // pencil below) — This PC isn't a folder, so isThisPC hides it outright
  // rather than showing a dead disabled star (this app's own established
  // "hide, don't disable, when an action can't apply" precedent).
  isCurrentFavorite: boolean;
  onToggleFavorite: () => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container";

export function AddressBar({
  currentPath,
  isThisPC,
  value,
  onChange,
  onSubmit,
  onNavigate,
  focusRequest,
  isCurrentFavorite,
  onToggleFavorite,
}: AddressBarProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+L signal — enter edit mode when the counter increments.
  useEffect(() => {
    if (focusRequest && focusRequest > 0) setEditing(true);
  }, [focusRequest]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          setEditing(false);
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          className="w-full rounded-lg border border-surface-container-highest bg-surface-container px-2.5 py-1.5 text-[13px] text-on-surface transition-colors duration-150 focus:border-primary-container focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onChange(currentPath);
              setEditing(false);
            }
          }}
        />
      </form>
    );
  }

  return (
    <div
      className="flex flex-1 items-center gap-1 overflow-hidden rounded-lg border border-surface-container-highest bg-surface-container px-2.5 py-1.5 text-[13px] text-on-surface transition-colors duration-150 hover:border-outline-variant"
      onClick={() => setEditing(true)}
    >
      {!isThisPC && (
        <button
          type="button"
          title={isCurrentFavorite ? "Unstar this folder (Ctrl+D)" : "Star this folder (Ctrl+D)"}
          aria-label={isCurrentFavorite ? "Unstar this folder" : "Star this folder"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={`shrink-0 rounded p-1 transition-colors duration-150 ${focusRing} ${
            isCurrentFavorite
              ? "text-tertiary hover:bg-surface-container-highest"
              : "text-outline hover:bg-surface-container-highest hover:text-on-surface"
          }`}
        >
          <Star size={13} strokeWidth={1.75} fill={isCurrentFavorite ? "currentColor" : "none"} />
        </button>
      )}
      {isThisPC ? (
        <span className="flex items-center gap-1.5 px-1 text-on-surface">
          <Monitor size={14} strokeWidth={1.75} className="text-outline" />
          This PC
        </span>
      ) : (
        <Breadcrumbs path={currentPath} onNavigate={onNavigate} />
      )}
      <button
        type="button"
        title="Edit path (Ctrl+L)"
        className={`ml-auto shrink-0 rounded p-1 text-outline transition-colors duration-150 hover:bg-surface-container-highest hover:text-on-surface ${focusRing}`}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
      >
        <Pencil size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const { containerRef, measureRef, ellipsisRef, segments, hidden, visible, showHidden, dropdownPos, toggleDropdown, closeDropdown } =
    useBreadcrumbOverflow(path);

  return (
    <div ref={containerRef} className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
      <div
        ref={measureRef}
        style={{ position: "absolute", visibility: "hidden", whiteSpace: "nowrap", pointerEvents: "none", top: 0, left: 0 }}
        className="flex gap-1"
      >
        {segments.map((s) => (
          <span key={s.path} className="px-1">
            {stripZipMarkerSuffix(s.label)}
          </span>
        ))}
        <span className="px-1">…</span>
      </div>

      {hidden.length > 0 && (
        <button
          ref={ellipsisRef}
          type="button"
          className={`flex items-center rounded px-1 text-outline transition-colors duration-150 hover:bg-surface-container-highest hover:text-primary ${focusRing}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleDropdown();
          }}
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
      )}
      {showHidden && (
        <div
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          className="animate-menu-in fixed z-50 flex min-w-32 flex-col gap-0.5 rounded-lg border border-surface-container-highest bg-surface-container-high p-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {hidden.map((s) => (
            <button
              key={s.path}
              type="button"
              className={`rounded px-2.5 py-1.5 text-left text-[13px] text-on-surface transition-colors duration-150 hover:bg-surface-container-highest ${focusRing}`}
              onClick={() => {
                closeDropdown();
                onNavigate(s.path);
              }}
            >
              {stripZipMarkerSuffix(s.label)}
            </button>
          ))}
        </div>
      )}
      {visible.map((segment, i) => (
        <span key={segment.path} className="flex items-center gap-1">
          {(i > 0 || hidden.length > 0) && <span className="text-outline">›</span>}
          <button
            type="button"
            className={`shrink-0 rounded px-1 transition-colors duration-150 hover:bg-surface-container-highest hover:text-primary ${focusRing}`}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(segment.path);
            }}
          >
            {stripZipMarkerSuffix(segment.label)}
          </button>
        </span>
      ))}
    </div>
  );
}
