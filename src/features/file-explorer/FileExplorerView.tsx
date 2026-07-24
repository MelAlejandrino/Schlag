import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Check, ChevronDown, ChevronUp, FolderOpen, Loader2, X } from "lucide-react";
import { useFileExplorer } from "./useFileExplorer";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { useTheme } from "./lib/useTheme";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { EntryTable } from "./components/EntryTable";
import { EntryGrid } from "./components/EntryGrid";
import { FilterBar } from "./components/FilterBar";
import { ThisPCView } from "./components/ThisPCView";
import { ContextMenu } from "./components/ContextMenu";
import { IndexStatusBadge } from "./components/IndexStatusBadge";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { SettingsPage } from "./components/SettingsPage";
import { TerminalPanel } from "./components/TerminalPanel";
import { StatusBar } from "./components/StatusBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { EditActionsBar } from "./components/EditActionsBar";
import { ListingActions } from "./components/ListingActions";
import { WindowControls } from "./components/WindowControls";
import { WindowResizeHandles } from "./components/WindowResizeHandles";
import { useExclusiveMenu } from "./lib/useExclusiveMenu";
import { useClickOutsideClose } from "./lib/useClickOutsideClose";
import { useSearchStore } from "./store/search.store";
import { formatSize } from "./lib/format";
import { basename } from "./lib/path";
import { fileExplorerService } from "./services/file-explorer.service";
import { useFileExplorerStore } from "./store/file-explorer.store";
import { useCopyProgressStore, type CopyOp } from "./store/copy-progress.store";

export function FileExplorerView() {
  useTheme();
  const explorer = useFileExplorer();

  // Status-bar figures — files only (directory sizes aren't tracked).
  const selectedSize = useMemo(
    () => explorer.selectedEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0),
    [explorer.selectedEntries],
  );
  const totalSize = useMemo(
    () => explorer.visibleEntries.reduce((sum, e) => sum + (e.is_dir ? 0 : e.size), 0),
    [explorer.visibleEntries],
  );

  useKeyboardShortcuts({
    onRefresh: explorer.refresh,
    onFocusFilter: explorer.requestFocusFilter,
    onNewFolder: explorer.newFolder,
    onNewFile: explorer.newFile,
    onRename: explorer.renameSelected,
    onDelete: explorer.deleteSelected,
    onToggleFavorite: explorer.toggleCurrentFavorite,
    onCopy: explorer.copySelected,
    onCut: explorer.cutSelected,
    onPaste: explorer.pasteIntoCurrent,
    onNewTab: () => explorer.newTab(),
    onCloseTab: () => explorer.closeTab(explorer.activeTabId),
    onNextTab: () => explorer.nextTab(),
    onPrevTab: () => explorer.prevTab(),
    onFocusAddress: () => explorer.requestFocusAddress(),
    onOpenSettings: () => explorer.openSettings(),
    onEscape: () => {
      // A context menu is its own dismissible overlay, same as every modal
      // in this app — it must take priority over selection, which it
      // previously didn't (Escape silently did the wrong thing while a
      // context menu was open, since this handler never checked for one).
      if (explorer.contextMenu) explorer.closeContextMenu();
      else explorer.clearSelection();
    },
  });

  useClickOutsideClose(!!explorer.contextMenu, explorer.closeContextMenu);

  useExclusiveMenu(!!explorer.contextMenu, explorer.closeContextMenu);

  const searchInFolder = useCallback((folder: string) => {
    useSearchStore.getState().openSearchInFolder(folder);
  }, []);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-surface text-on-surface"
      onContextMenu={(e) => e.preventDefault()}
    >
      {explorer.isSettings ? (
        <SettingsTitleBar />
      ) : (
        <TabBar
          tabs={explorer.tabs}
          activeTabId={explorer.activeTabId}
          onSwitchTab={explorer.switchTab}
          onCloseTab={explorer.closeTab}
          onNewTab={explorer.newTab}
          onReorderTab={explorer.reorderTabs}
          onDrop={explorer.dropOnto}
        />
      )}

      {!explorer.isSettings && <Toolbar
        canGoBack={explorer.canGoBack}
        canGoForward={explorer.canGoForward}
        canGoUp={!explorer.isThisPC}
        isThisPC={explorer.isThisPC}
        isCurrentFavorite={explorer.isCurrentFavorite}
        currentPath={explorer.currentPath}
        addressInput={explorer.addressInput}
        onBack={explorer.goBack}
        onForward={explorer.goForward}
        onUp={explorer.goUp}
        onRefresh={explorer.refresh}
        onToggleFavorite={() => explorer.toggleFavorite(explorer.currentPath)}
        onAddressChange={explorer.setAddressInput}
        onAddressSubmit={() => explorer.navigate(explorer.addressInput)}
        onNavigate={explorer.navigate}
        onSearch={explorer.requestFocusFilter}
        focusAddressBar={explorer.focusAddressBar}
      />}

      {!explorer.isSettings && (!explorer.isThisPC || explorer.hasSearchResults) && (
        <EditActionsBar
          selectedCount={explorer.selectedEntries.length}
          canPaste={explorer.canPaste}
          hasClipboard={explorer.hasClipboard}
          insideZip={explorer.insideZip}
          onCut={explorer.cutSelected}
          onCopy={explorer.copySelected}
          onPaste={explorer.pasteIntoCurrent}
          onClearClipboard={explorer.clearClipboard}
          onRename={explorer.renameSelected}
          onDelete={explorer.deleteSelected}
          rightSlot={
            <ListingActions
              isThisPC={explorer.isThisPC}
              insideZip={explorer.insideZip}
              onOpenTerminal={explorer.openTerminalToolbar}
              onNewFolder={explorer.newFolder}
              onNewFile={explorer.newFile}
              viewMode={explorer.viewMode}
              onViewModeChange={explorer.setViewMode}
              sortKey={explorer.sortKey}
              sortDirection={explorer.sortDirection}
              onSortKeyChange={explorer.setSortKey}
              onSortDirectionChange={explorer.setSortDirection}
              groupBy={explorer.groupBy}
              onGroupByChange={explorer.setGroupBy}
              groupOrder={explorer.groupOrder}
              onGroupOrderChange={explorer.setGroupOrder}
            />
          }
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {!explorer.isSettings && (
            <Sidebar
              quickAccess={explorer.quickAccess}
              favorites={explorer.favorites}
              drives={explorer.drives}
              currentPath={explorer.currentPath}
              onNavigate={explorer.navigate}
              onUnstar={explorer.toggleFavorite}
              onDrop={explorer.dropOnto}
              onOpenInNewTab={explorer.newTab}
              onToggleFavorite={explorer.toggleFavorite}
              onShowProperties={explorer.showPropertiesForPath}
              onOpenSettings={explorer.openSettings}
              onSearchInFolder={searchInFolder}
            />
          )}

          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {explorer.error && (
              <div className="m-3 flex shrink-0 items-start gap-2 rounded-lg border border-error-container bg-error-container/20 px-3 py-2 text-on-error-container">
                <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-error" />
                <span className="min-w-0 flex-1 text-[13px]">{explorer.error}</span>
                <button
                  onClick={explorer.clearError}
                  className="shrink-0 rounded p-0.5 text-error transition-colors duration-150 hover:bg-error-container/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
                  title="Dismiss"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            )}

            <UpdateBanner />

            {explorer.isSettings ? (
              <SettingsPage onBack={explorer.closeSettings} />
            ) : explorer.isThisPC && !explorer.hasSearchResults ? (
              <ThisPCView
                quickAccess={explorer.quickAccess}
                favorites={explorer.favorites}
                drives={explorer.drives}
                onNavigate={explorer.navigate}
                onDrop={explorer.dropOnto}
              />
            ) : explorer.viewMode === "list" ? (
              <EntryTable
                    entries={explorer.visibleEntries}
                    selectedPaths={explorer.selectedPaths}
                    currentPath={explorer.currentPath}
                    cutPaths={explorer.cutPaths}
                    revealPath={explorer.revealPath}
                    onRevealed={() => explorer.setRevealPath(null)}
                    onOpen={explorer.openEntry}
                    onSelect={explorer.selectEntry}
                    onContextMenu={explorer.openContextMenuForEntry}
                    onClearSelection={explorer.clearSelection}
                    onDragPaths={explorer.getDragPaths}
                    onDrop={explorer.dropOnto}
                    onBackgroundContextMenu={explorer.openBackgroundContextMenu}
                    sortKey={explorer.sortKey}
                    sortDirection={explorer.sortDirection}
                    onSortColumnClick={explorer.onSortColumnClick}
                    groupBy={explorer.groupBy}
                    onSelectOnly={explorer.selectOnly}
                    onSelectRange={explorer.selectRange}
                    onDelete={explorer.deleteSelected}
                    onRename={explorer.renameSelected}
                    getFileTags={explorer.getFileTags}
                  />
                ) : (
                  <EntryGrid
                    entries={explorer.visibleEntries}
                    selectedPaths={explorer.selectedPaths}
                    currentPath={explorer.currentPath}
                    cutPaths={explorer.cutPaths}
                    revealPath={explorer.revealPath}
                    onRevealed={() => explorer.setRevealPath(null)}
                    onOpen={explorer.openEntry}
                    onSelect={explorer.selectEntry}
                    onContextMenu={explorer.openContextMenuForEntry}
                    onClearSelection={explorer.clearSelection}
                    onDragPaths={explorer.getDragPaths}
                    onDrop={explorer.dropOnto}
                    onBackgroundContextMenu={explorer.openBackgroundContextMenu}
                    groupBy={explorer.groupBy}
                    size={explorer.viewMode}
                    onSelectOnly={explorer.selectOnly}
                    onSelectRange={explorer.selectRange}
                onDelete={explorer.deleteSelected}
                onRename={explorer.renameSelected}
                getFileTags={explorer.getFileTags}
              />
            )}

            {!explorer.isSettings && !explorer.terminalOpen && <FilterBar />}
          </main>
        </div>

        {explorer.terminalOpen && !explorer.isSettings && <TerminalPanel />}

        {!explorer.isSettings && (!explorer.isThisPC || explorer.hasSearchResults) && (
          <StatusBar
            itemCount={explorer.visibleEntries.length}
            selectedCount={explorer.selectedEntries.length}
            selectedSize={selectedSize}
            totalSize={totalSize}
          />
        )}
      </div>

      {explorer.contextMenu && (
        <ContextMenu
          state={explorer.contextMenu}
          onDismiss={explorer.closeContextMenu}
          selectedCount={explorer.selectedEntries.length}
          selectedIsDir={explorer.selectedIsDir}
          canPaste={explorer.canPaste}
          isCurrentFavorite={explorer.isCurrentFavorite}
          currentPath={explorer.currentPath}
          selectedPath={explorer.selectedEntries.length === 1 ? explorer.selectedEntries[0].path : undefined}
          onOpen={explorer.openSelected}
          onOpenWith={explorer.openWithSelected}
          onOpenInNewTab={explorer.openSelectedInNewTab}
          onOpenLocation={explorer.hasSearchResults ? explorer.openLocationSelected : undefined}
          onOpenTerminal={explorer.openTerminalContextMenu}
          onRename={explorer.renameSelected}
          onCopy={explorer.copySelected}
          onCut={explorer.cutSelected}
          onPaste={explorer.pasteIntoCurrent}
          onDelete={explorer.deleteSelected}
          onProperties={explorer.showPropertiesSelected}
          onNewFolder={explorer.newFolder}
          onNewFile={explorer.newFile}
          onRefresh={explorer.refresh}
          onToggleFavorite={explorer.toggleCurrentFavorite}
          onSearchInFolder={searchInFolder}
          allTags={explorer.allTags}
          selectedFileTags={
            explorer.selectedEntries.length === 1
              ? explorer.getFileTags(explorer.selectedEntries[0].path)
              : []
          }
          onToggleFileTag={explorer.toggleFileTagForSelected}
          onCreateTag={explorer.createTagForSelected}
        />
      )}

      {explorer.promptConfig && (
        <PromptModal
          {...explorer.promptConfig}
          onConfirm={explorer.confirmPrompt}
          onCancel={explorer.closePrompt}
        />
      )}

      {explorer.deleteConfirmOpen && (
        <ConfirmModal
          title="Delete"
          message={explorer.deleteMessage}
          confirmLabel="Delete"
          onConfirm={explorer.confirmDelete}
          onCancel={explorer.closeDeleteConfirm}
        />
      )}

      {explorer.permanentDeleteTarget && (
        <ConfirmModal
          title="Delete permanently"
          message={explorer.permanentDeleteMessage}
          confirmLabel="Delete permanently"
          onConfirm={explorer.confirmPermanentDelete}
          onCancel={explorer.closePermanentDelete}
        />
      )}

      <CopyProgressStack />


      <IndexStatusBadge />

      <WindowResizeHandles />
    </div>
  );
}

// Transfer toasts, docked bottom-right (download-manager convention, and out
// of the way of the centered listing and the index badge now at bottom-left).
// A second paste started while the first still runs gets its own bar. The
// stack is height-capped and scrolls \u2014 with many operations it can never grow
// past the top of the window (the bug the old unbounded upward stack had).
// Subscribes only to the dedicated progress store, so these frequent updates
// never re-render the file listing.
function CopyProgressStack() {
  const ops = useCopyProgressStore((s) => s.ops);
  const [collapsed, setCollapsed] = useState(false);
  const list = Object.values(ops);
  // Header (with collapse toggle) only when there's more than one — a single
  // toast has nothing to collapse.
  const multi = list.length > 1;
  // Auto-collapse once two or more are running at once (they'd otherwise
  // stack up and crowd the corner); the user can still expand manually, and
  // that choice sticks until the count drops back to one and climbs again.
  useEffect(() => {
    if (multi) setCollapsed(true);
  }, [multi]);
  if (list.length === 0) return null;
  const goTo = (dir: string) => void useFileExplorerStore.getState().navigate(dir);
  const active = list.filter((o) => !o.done && !o.reverting).length;
  return (
    <div className="fixed bottom-4 right-4 z-[80] flex max-h-[calc(100vh-6rem)] w-80 flex-col gap-2 overflow-y-auto">
      {multi && (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-1.5 text-[11px] font-medium text-on-surface shadow-lg hover:bg-surface-container-highest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span>{active > 0 ? `${active} of ${list.length} in progress` : `${list.length} operations`}</span>
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      )}
      {!collapsed &&
        list.map((op) => (
          <CopyProgressBar
            key={op.id}
            progress={op}
            onCancel={() => void fileExplorerService.cancelCopy(op.id)}
            onGoToDest={() => goTo(op.destDir)}
          />
        ))}
    </div>
  );
}

// One toast for one batch. Items within a batch copy sequentially (only one
// in flight), so it shows "Copying 3 of 10", the current file, the byte bar,
// a folder button that jumps to the destination, and Cancel. Once cancelled
// it flips to a "Reverting\u2026" state while the already-pasted items are undone.
function CopyProgressBar({
  progress,
  onCancel,
  onGoToDest,
}: {
  progress: CopyOp;
  onCancel: () => void;
  onGoToDest: () => void;
}) {
  const pct = progress.total > 0 ? Math.min(100, (progress.written / progress.total) * 100) : 0;
  const verb = progress.op === "cut" ? "Moving" : "Copying";
  const heading = progress.count > 1 ? `${verb} ${progress.index + 1} of ${progress.count}` : verb;
  const bytes = progress.total > 0
    ? `${formatSize(progress.written, false)} / ${formatSize(progress.total, false)}`
    : "\u2026";

  if (progress.reverting) {
    return (
      <div className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 shadow-lg">
        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="truncate">Cancelled \u2014 undoing changes\u2026</span>
        </div>
      </div>
    );
  }

  // Finished: a green check so it's unmistakably done, not stuck. Auto-clears
  // shortly after (DONE_LINGER_MS). The destination stays clickable.
  if (progress.done) {
    return (
      <div className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 shadow-lg">
        <div className="flex items-center gap-2 text-[11px]">
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="shrink-0 text-on-surface">{progress.op === "cut" ? "Moved to" : "Copied to"}</span>
          <button
            type="button"
            onClick={onGoToDest}
            title={`Go to ${progress.destDir}`}
            className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-medium text-on-surface hover:bg-surface-container-highest hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <FolderOpen className="h-3 w-3 shrink-0" />
            <span className="truncate">{basename(progress.destDir)}</span>
          </button>
        </div>
      </div>
    );
  }

  // Bytes are all written but the command hasn't returned yet (it's updating
  // the search index). Say "Finishing\u2026" instead of sitting at a static 100%
  // that reads as frozen.
  const finishing = progress.total > 0 && progress.written >= progress.total;

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container px-3 py-2.5 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-on-surface">{heading}</span>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-3 w-3" /> Cancel
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-on-surface-variant">
        <span className="truncate">{progress.name}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <button
          type="button"
          onClick={onGoToDest}
          title={`Go to ${progress.destDir}`}
          className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 font-medium text-on-surface hover:bg-surface-container-highest hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{basename(progress.destDir)}</span>
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        {finishing ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-on-surface-variant">
            <Loader2 className="h-3 w-3 animate-spin" /> Finishing…
          </span>
        ) : (
          <span className="shrink-0 text-[11px] tabular-nums text-on-surface-variant">{bytes}</span>
        )}
      </div>
    </div>
  );
}

function SettingsTitleBar() {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-surface-container-highest bg-surface-container-low">
      <span className="ml-3 self-center text-[12px] font-medium text-on-surface">Settings</span>
      <span className="flex-1 self-stretch" data-tauri-drag-region />
      <WindowControls />
    </div>
  );
}
