import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Window chrome (minimize/maximize/close) is app-shell concern, not
// file-explorer domain — so its Tauri calls live in this dedicated hook
// rather than fileExplorerService (which is specifically the invoke()
// wrapper for filesystem commands). Same "logic in a lib/ hook, component
// stays presentational" shape as useIndexStatus/useDragResize.
//
// getCurrentWindow() is called lazily inside each handler/effect rather than
// once at module scope: under a plain `vite dev` (no Tauri webview) the
// __TAURI_INTERNALS__ it reads don't exist, and deferring the call keeps an
// accidental non-Tauri render from throwing at import time.
export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const sync = () => {
      appWindow.isMaximized().then((m) => {
        if (!cancelled) setIsMaximized(m);
      });
    };
    sync();
    // Re-query on every resize rather than toggling a boolean in our own
    // click handler — maximized state also changes via OS snapping (Win+Up,
    // drag-to-top, double-click the drag region), none of which go through
    // our button, so the button's restore/maximize icon must track the real
    // window state, not just what we last did to it.
    appWindow
      .onResized(sync)
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return {
    isMaximized,
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
    close: () => getCurrentWindow().close(),
  };
}
