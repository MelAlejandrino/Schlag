import { useCallback, useEffect, useMemo } from "react";
import { AlertCircle, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { useFileExplorerStore } from "./store/file-explorer.store";
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

  // Listen for chunked copy progress events from the Rust backend. Each
  // event carries { total, written } for the current file being copied;
  // the progress bar renders only while copyProgress is non-null (set by
  // pasteIntoCurrent/dropOnto before the first file, cleared in finally).
  useEffect(() => {
    const unlisten = listen<{ total: number; written: number }>("copy-progress", (e) => {
      useFileExplorerStore.setState({ copyProgress: e.payload });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

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

      {explorer.copyProgress && (
        <CopyProgressBar progress={explorer.copyProgress} />
      )}

      <IndexStatusBadge />

      <WindowResizeHandles />
    </div>
  );
}

function CopyProgressBar({ progress }: { progress: { total: number; written: number } }) {
  const pct = progress.total > 0 ? Math.min(100, (progress.written / progress.total) * 100) : 0;
  const label = progress.total > 0
    ? `${formatSize(progress.written, false)} / ${formatSize(progress.total, false)}`
    : "Copying\u2026";
  return (
    <div className="fixed bottom-12 left-1/2 z-[80] w-80 -translate-x-1/2 rounded-lg border border-outline-variant bg-surface-container shadow-lg">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-on-surface-variant">{label}</span>
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
