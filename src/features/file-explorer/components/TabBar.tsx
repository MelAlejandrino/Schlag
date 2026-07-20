import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { isTabDrag, startTabDrag } from "../lib/dnd";
import { useDropTarget } from "../lib/useDropTarget";
import { useExclusiveMenu } from "../lib/useExclusiveMenu";
import { useClickOutsideClose } from "../lib/useClickOutsideClose";
import { useTabFlip } from "../lib/useTabFlip";
import { tabLabel, type Tab } from "../lib/tabs";
import { TabContextMenu } from "./TabContextMenu";
import { WindowControls } from "./WindowControls";

type DropHandler = (sourcePaths: string[], targetPath: string, isCopy: boolean) => void;

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: (path?: string) => void;
  onReorderTab: (draggedId: string, targetId: string, insertAfter: boolean) => void;
  onDrop: DropHandler;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-low";

// Short enough to feel immediate once you've deliberately paused on a tab,
// long enough that a drag merely passing over one on its way elsewhere
// doesn't switch it. 600ms (closer to Chrome's own delay) measured live as
// feeling sluggish for this app's own drag-and-drop-heavy workflow.
const HOVER_SWITCH_DELAY_MS = 300;

interface TabMenuState {
  x: number;
  y: number;
  tabId: string;
}

// Sits above Toolbar (which already contains the address bar) — the
// Chrome-style "tabs on top, location bar below" layout, not VS Code's
// "tabs below a separate menu bar" one, since there's no separate menu bar
// here for tabs to sit under. Same bg/border tone as Toolbar so the two
// read as one connected unit rather than two competing bars.
export function TabBar({ tabs, activeTabId, onSwitchTab, onCloseTab, onNewTab, onReorderTab, onDrop }: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<TabMenuState | null>(null);
  // The id of the tab currently being dragged for reordering. A ref, not
  // state, because it must be readable inside dragover handlers WITHOUT
  // triggering re-renders — and because the browser blocks
  // dataTransfer.getData() during dragover for security, so the id can't be
  // recovered from the event mid-drag; we stash it here on dragstart instead.
  const draggedTabId = useRef<string | null>(null);
  // Slides each tab from its previous slot to its new one on reorder/close.
  const registerTab = useTabFlip(draggedTabId);
  // Tabs playing their exit animation — kept in the array (still rendered)
  // until animationend, so there's something on screen to animate before the
  // real close removes them from the store.
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());

  // Route every close through here so the tab shrinks out first. The last tab
  // never closes (the store refuses), so there's nothing to animate; and under
  // reduced motion there's no animationend to wait on, so close immediately.
  function requestClose(id: string) {
    if (tabs.length <= 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onCloseTab(id);
      return;
    }
    setClosingIds((s) => new Set(s).add(id));
  }

  function finishClose(id: string) {
    setClosingIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    onCloseTab(id);
  }

  useClickOutsideClose(!!contextMenu, () => setContextMenu(null));

  useExclusiveMenu(!!contextMenu, () => setContextMenu(null));

  // Live reordering: as the pointer crosses a tab's midpoint, the dragged
  // tab moves to that side immediately (the tabs shift in real time, like
  // Chrome/VS Code), rather than waiting for the drop. This is what makes
  // reordering reliable — the old drop-based before/after model had dead
  // zones (dropping onto the near half of an adjacent tab removed-then-
  // reinserted at the same index, a silent no-op that read as "it didn't
  // swap"). The "only commit once the pointer has crossed the midpoint in
  // the direction of travel" guard is the canonical sortable-list rule that
  // prevents oscillation: once moved, the dragged tab sits on the committed
  // side and won't bounce back until the pointer clearly crosses the other
  // way. React reuses each tab's DOM node (keyed by id) across the reorder,
  // so moving it mid-drag doesn't interrupt the native drag session.
  function handleReorderDragOver(targetId: string, clientX: number, rect: DOMRect) {
    const draggedId = draggedTabId.current;
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = tabs.findIndex((t) => t.id === draggedId);
    const targetIndex = tabs.findIndex((t) => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const pastMidpoint = clientX > rect.left + rect.width / 2;
    if (draggedIndex < targetIndex) {
      if (pastMidpoint) onReorderTab(draggedId, targetId, true);
    } else if (!pastMidpoint) {
      onReorderTab(draggedId, targetId, false);
    }
  }

  return (
    // The whole tab bar doubles as the window's custom title bar now that
    // the native chrome is gone (decorations: false). items-stretch so the
    // window controls span the full height flush to the top-right corner,
    // Windows-style; the tab strip keeps its own pt-2 top breathing room.
    <div className="flex shrink-0 items-stretch border-b border-surface-container-highest bg-surface-container-low">
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-2 pt-2">
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            innerRef={registerTab(tab.id)}
            closing={closingIds.has(tab.id)}
            onExited={() => finishClose(tab.id)}
            onSwitchTab={onSwitchTab}
            onCloseTab={requestClose}
            onDrop={onDrop}
            onTabDragStart={(id) => (draggedTabId.current = id)}
            onTabDragEnd={() => (draggedTabId.current = null)}
            onReorderDragOver={handleReorderDragOver}
            onContextMenu={(x, y) => setContextMenu({ x, y, tabId: tab.id })}
          />
        ))}
        <button
          type="button"
          title="New tab"
          onClick={() => onNewTab()}
          className={`shrink-0 rounded-lg p-1.5 text-outline transition-colors duration-150 hover:bg-surface-container-high hover:text-on-surface ${focusRing}`}
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
      </div>

      {/* Fills the gap between the tabs and the controls, and is the window's
          drag handle — data-tauri-drag-region lets Tauri move the window on
          mousedown here (and maximize on double-click). Interactive children
          (tabs, buttons, controls) don't carry the attribute, so they still
          work normally; only this empty space drags. */}
      <div className="flex-1 self-stretch" data-tauri-drag-region />

      <WindowControls />

      {contextMenu && (
        <div onClick={(e) => e.stopPropagation()}>
          <TabContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onDismiss={() => setContextMenu(null)}
            canClose={tabs.length > 1}
            onClose={() => {
              requestClose(contextMenu.tabId);
              setContextMenu(null);
            }}
            onDuplicate={() => {
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              if (tab) onNewTab(tab.currentPath);
              setContextMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  active: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
  closing: boolean;
  onExited: () => void;
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onDrop: DropHandler;
  onTabDragStart: (id: string) => void;
  onTabDragEnd: () => void;
  onReorderDragOver: (targetId: string, clientX: number, rect: DOMRect) => void;
  onContextMenu: (x: number, y: number) => void;
}

function TabItem({ tab, active, innerRef, closing, onExited, onSwitchTab, onCloseTab, onDrop, onTabDragStart, onTabDragEnd, onReorderDragOver, onContextMenu }: TabItemProps) {
  // Keyed off a ref, not React state — the timer must survive across the
  // many onDragOver re-renders that happen while just hovering in place,
  // and must be cancelable from onDragLeave/onDrop before it ever fires.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHoverTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  // dropOnto (useFileExplorer.ts) already no-ops a THIS_PC target, so a tab
  // sitting at This PC still switches-on-hover here (useful on its own —
  // "let me go look at This PC while I decide") even though dropping
  // directly on it can't complete a real move/copy.
  const dropTarget = useDropTarget(tab.currentPath, onDrop, () => {
    if (active || hoverTimer.current) return;
    hoverTimer.current = setTimeout(() => {
      onSwitchTab(tab.id);
      hoverTimer.current = null;
    }, HOVER_SWITCH_DELAY_MS);
  });

  return (
    // A div, not a button — the close button has to live inside it, and
    // buttons can't nest. Matches EntryTable's own row-is-a-div-with-onClick
    // precedent for the same reason.
    <div
      ref={innerRef}
      role="tab"
      aria-selected={active}
      tabIndex={0}
      // Only the exit animation should trigger the real close — tab-in also
      // fires animationend (on mount), so gate on `closing`.
      onAnimationEnd={() => {
        if (closing) onExited();
      }}
      draggable
      onDragStart={(e) => {
        startTabDrag(e, tab.id);
        onTabDragStart(tab.id);
      }}
      onDragEnd={onTabDragEnd}
      onClick={() => onSwitchTab(tab.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSwitchTab(tab.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        // A tab being dragged for reordering is handled entirely separately
        // from a file being dragged onto this tab — isTabDrag checks the
        // dataTransfer types (readable during dragover, unlike getData), so a
        // tab-drag reorders live and never starts the file-drop hover-switch
        // timer, and a file-drag never triggers a reorder.
        if (isTabDrag(e)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onReorderDragOver(tab.id, e.clientX, e.currentTarget.getBoundingClientRect());
          return;
        }
        dropTarget.onDragOver(e);
      }}
      onDragLeave={() => {
        clearHoverTimer();
        dropTarget.onDragLeave();
      }}
      onDrop={(e) => {
        clearHoverTimer();
        // A tab reorder has already been applied live during dragover — the
        // drop just needs to preventDefault so the browser doesn't treat it
        // as an unhandled drop. Only a file drop still has real work to do.
        if (isTabDrag(e)) {
          e.preventDefault();
          return;
        }
        dropTarget.onDrop(e);
      }}
      title={tab.currentPath === tabLabel(tab.currentPath) ? undefined : tab.currentPath}
      className={`${closing ? "animate-tab-out pointer-events-none" : "animate-tab-in"} group flex max-w-56 min-w-32 shrink-0 cursor-default items-center gap-2 rounded-t-lg border border-b-0 px-3 py-2 text-[13px] transition-colors duration-150 select-none ${focusRing} ${
        dropTarget.isOver
          ? "border-primary-container bg-surface-container-high text-primary"
          : active
            ? "border-surface-container-highest bg-surface text-primary"
            : "border-transparent text-outline hover:bg-surface-container-high hover:text-on-surface"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{tabLabel(tab.currentPath)}</span>
      <button
        type="button"
        title="Close tab"
        onClick={(e) => {
          e.stopPropagation();
          onCloseTab(tab.id);
        }}
        className={`shrink-0 rounded p-1 text-outline opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-surface-container-highest hover:text-on-surface ${
          active ? "opacity-100" : ""
        } ${focusRing}`}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
