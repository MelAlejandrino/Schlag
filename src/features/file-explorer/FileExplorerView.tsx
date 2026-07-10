import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { useFileExplorer } from "./useFileExplorer";
import { useSearch } from "./useSearch";
import { Sidebar } from "./components/Sidebar";
import { TabBar } from "./components/TabBar";
import { Toolbar } from "./components/Toolbar";
import { EntryTable } from "./components/EntryTable";
import { EntryGrid } from "./components/EntryGrid";
import { ThisPCView } from "./components/ThisPCView";
import { PreviewPane } from "./components/PreviewPane";
import { ContextMenu } from "./components/ContextMenu";
import { IndexStatusBadge } from "./components/IndexStatusBadge";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { SearchModal } from "./components/SearchModal";
import { WindowResizeHandles } from "./components/WindowResizeHandles";

export function FileExplorerView() {
  const explorer = useFileExplorer();
  const search = useSearch();

  useEffect(() => {
    if (!explorer.contextMenu) return;
    const close = () => explorer.closeContextMenu();
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [explorer.contextMenu]);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-surface text-on-surface"
      onContextMenu={(e) => e.preventDefault()}
    >
      <TabBar
        tabs={explorer.tabs}
        activeTabId={explorer.activeTabId}
        onSwitchTab={explorer.switchTab}
        onCloseTab={explorer.closeTab}
        onNewTab={explorer.newTab}
        onReorderTab={explorer.reorderTabs}
        onDrop={explorer.dropOnto}
      />

      <Toolbar
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
        onOpenSearch={search.openSearch}
        onNewFolder={explorer.newFolder}
        onNewFile={explorer.newFile}
        previewOpen={explorer.previewOpen}
        onTogglePreview={explorer.togglePreview}
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

      <div className="flex min-h-0 flex-1">
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
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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

          {explorer.isThisPC ? (
            <ThisPCView
              quickAccess={explorer.quickAccess}
              favorites={explorer.favorites}
              drives={explorer.drives}
              onNavigate={explorer.navigate}
              onDrop={explorer.dropOnto}
            />
          ) : explorer.viewMode === "list" ? (
            <EntryTable
              entries={explorer.entries}
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
            />
          ) : (
            <EntryGrid
              entries={explorer.entries}
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
            />
          )}
        </main>

        {explorer.previewOpen && (
          <PreviewPane
            entry={explorer.selectedEntries.length === 1 ? explorer.selectedEntries[0] : null}
            onClose={explorer.togglePreview}
          />
        )}
      </div>

      {explorer.contextMenu && (
        <ContextMenu
          state={explorer.contextMenu}
          selectedCount={explorer.selectedEntries.length}
          selectedIsDir={explorer.selectedIsDir}
          canPaste={explorer.canPaste}
          isCurrentFavorite={explorer.isCurrentFavorite}
          onOpen={explorer.openSelected}
          onOpenWith={explorer.openWithSelected}
          onOpenInNewTab={explorer.openSelectedInNewTab}
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

      <SearchModal />

      <IndexStatusBadge />

      <WindowResizeHandles />
    </div>
  );
}
