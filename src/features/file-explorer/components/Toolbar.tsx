import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCw,
  Search,
} from "lucide-react";
import { AddressBar } from "./AddressBar";
import { useRefreshAnimation } from "../lib/useRefreshAnimation";

interface ToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  isThisPC: boolean;
  isCurrentFavorite: boolean;
  currentPath: string;
  addressInput: string;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onToggleFavorite: () => void;
  onAddressChange: (value: string) => void;
  onAddressSubmit: () => void;
  onNavigate: (path: string) => void;
  onSearch: () => void;
  focusAddressBar?: number;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low";

// The joined "browser chrome" pill — back/forward/up/refresh behave as one
// segmented control (only this cluster keeps its own border box).
const groupButtonClass = `flex items-center justify-center bg-surface-container px-2.5 py-1.5 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface disabled:cursor-default disabled:opacity-40 disabled:hover:bg-surface-container disabled:hover:text-on-surface-variant ${focusRing}`;

// Search opens the floating filter/search bar (Ctrl+F does the same via
// requestFocusFilter). Borderless tonal-hover, matching the app's other ghost
// buttons; a visible label since a magnifier alone reads as filename-only.
const ghostButtonClass = `flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface ${focusRing}`;

const iconProps = { size: 16, strokeWidth: 1.75 };

export function Toolbar({
  canGoBack,
  canGoForward,
  canGoUp,
  isThisPC,
  isCurrentFavorite,
  currentPath,
  addressInput,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onToggleFavorite,
  onAddressChange,
  onAddressSubmit,
  onNavigate,
  onSearch,
  focusAddressBar,
}: ToolbarProps) {
  const { tick, trigger } = useRefreshAnimation(onRefresh);

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-surface-container-highest bg-surface-container-low p-2">
      <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-surface-container-highest">
        <button className={groupButtonClass} onClick={onBack} disabled={!canGoBack} title="Back" aria-label="Back">
          <ArrowLeft {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button className={groupButtonClass} onClick={onForward} disabled={!canGoForward} title="Forward" aria-label="Forward">
          <ArrowRight {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button className={groupButtonClass} onClick={onUp} disabled={!canGoUp} title="Up" aria-label="Up one level">
          <ArrowUp {...iconProps} />
        </button>
        <div className="h-5 w-px bg-surface-container-highest" />
        <button className={groupButtonClass} title="Refresh (Ctrl+R)" aria-label="Refresh" onClick={trigger}>
          <RotateCw {...iconProps} key={tick} className="animate-spin-once" />
        </button>
      </div>

      <AddressBar
        currentPath={currentPath}
        isThisPC={isThisPC}
        value={addressInput}
        onChange={onAddressChange}
        onSubmit={onAddressSubmit}
        onNavigate={onNavigate}
        focusRequest={focusAddressBar}
        isCurrentFavorite={isCurrentFavorite}
        onToggleFavorite={onToggleFavorite}
      />

      <button className={ghostButtonClass} title="Search (Ctrl+F)" onClick={onSearch}>
        <Search {...iconProps} />
        <span>Search</span>
      </button>
    </div>
  );
}
