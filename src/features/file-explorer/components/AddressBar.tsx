import { useEffect, useRef, useState } from "react";
import { Monitor, MoreHorizontal, Pencil } from "lucide-react";
import { useBreadcrumbOverflow } from "../lib/useBreadcrumbOverflow";

interface AddressBarProps {
  currentPath: string;
  isThisPC: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onNavigate: (path: string) => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container";

export function AddressBar({ currentPath, isThisPC, value, onChange, onSubmit, onNavigate }: AddressBarProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
        title="Edit path"
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
            {s.label}
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
              {s.label}
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
            {segment.label}
          </button>
        </span>
      ))}
    </div>
  );
}
