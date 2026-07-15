import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { fileExplorerService } from "../services/file-explorer.service";
import { useFileExplorerStore } from "../store/file-explorer.store";

// xterm.js's default ANSI palette is tuned for a dark background — leaving it
// at defaults while only overriding background/foreground/cursor left
// PowerShell's own default-yellow prompt text unreadable (bright yellow on a
// light-mode white background). Two full, hand-picked palettes instead —
// there's no existing per-hue design token this app's surface/on-surface/
// primary/error tokens could map onto for all 16 ANSI slots, so this is
// terminal-specific rather than derived from App.css's own custom properties.
const DARK_ANSI = {
  black: "#1b1c1c",
  red: "#ff5c57",
  green: "#5af78e",
  yellow: "#f3f99d",
  blue: "#57c7ff",
  magenta: "#ff6ac1",
  cyan: "#9aedfe",
  white: "#e4e2e1",
  brightBlack: "#686868",
  brightRed: "#ff5c57",
  brightGreen: "#5af78e",
  brightYellow: "#f3f99d",
  brightBlue: "#57c7ff",
  brightMagenta: "#ff6ac1",
  brightCyan: "#9aedfe",
  brightWhite: "#f1f1f0",
};

const LIGHT_ANSI = {
  black: "#181a24",
  red: "#c53030",
  green: "#2f9e44",
  yellow: "#8a6d00",
  blue: "#1c7ed6",
  magenta: "#ae3ec9",
  cyan: "#0c8599",
  white: "#494c5e",
  brightBlack: "#6b7280",
  brightRed: "#e03131",
  brightGreen: "#37b24d",
  brightYellow: "#a17f0a",
  brightBlue: "#1971c2",
  brightMagenta: "#9c36b5",
  brightCyan: "#0b7285",
  brightWhite: "#181a24",
};

// Read live so a theme switch is picked up the next time a shell is
// (re)spawned (this hook remounts its Terminal instance on every cwd change
// anyway), without wiring a separate live-update path for one widget.
function readTerminalTheme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  const isLight = document.documentElement.dataset.theme === "light";
  return {
    background: v("--color-surface-container-lowest"),
    foreground: v("--color-on-surface"),
    cursor: v("--color-primary"),
    selectionBackground: v("--color-surface-container-highest"),
    ...(isLight ? LIGHT_ANSI : DARK_ANSI),
  };
}

// Owns the whole PTY session lifecycle behind one xterm.js Terminal instance:
// spawning a shell at `cwd`, wiring keystrokes/resizes to it, draining its
// output, and tearing everything down (including telling the backend to close
// its PTY) on unmount or whenever `cwd` changes — no "cd" typed in for you, no
// session tracked across navigations. Pulled out of TerminalPanel.tsx (a
// component) into its own hook, matching this codebase's own convention
// applied everywhere else (useBreadcrumbOverflow, useWindowControls,
// useDragResize, etc.): components stay presentation-only, and non-trivial
// logic — especially an async state machine like this one — lives in a hook
// even when only one component uses it.
export function useTerminalSession(cwd: string, onExit: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      convertEol: true,
      // A real monospace stack, not "Geist" (this app's own UI font, but
      // proportional) — xterm.js lays out a fixed character grid, and a
      // proportional font breaks that assumption, producing uneven glyph
      // spacing. Consolas ships with Windows itself; Cascadia Mono/Code are
      // common but not guaranteed (only present with Windows Terminal/VS
      // installed), so they're preferred fallbacks, not the baseline.
      fontFamily: "Cascadia Mono, Cascadia Code, Consolas, 'Courier New', monospace",
      fontSize: 13,
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    fit.fit(); // sizes term.cols/term.rows to the real container before anything spawns
    term.focus();

    let cancelled = false;
    // A ref rather than a closure captured inside the .then() below — onData/
    // onResize/the output+exit listeners are all registered immediately
    // (next), before the backend session exists, so they need somewhere to
    // read the id from once it's ready, and something to filter incoming
    // events by (the fixed-event-name scheme means an event carries any
    // session's id, not just this hook's own).
    const sessionIdRef = { current: null as number | null };

    // Registered up front, in parallel with — not sequentially after —
    // openTerminal below. The backend's reader thread can start emitting
    // "terminal-output"/"terminal-exit" before terminal_open even returns;
    // registering these listeners only after that invoke resolved (the old
    // code) left a real gap where an abnormally-fast shell exit could emit
    // before the frontend was listening, leaving the panel stuck open
    // forever showing a dead shell. Listener registration is a fast local
    // IPC round-trip, while terminal_open has to actually spawn a real OS
    // process — starting both at once means the listener almost always wins.
    const outputListener = fileExplorerService.onTerminalOutput((id, data) => {
      if (sessionIdRef.current === id) term.write(data);
    });
    const exitListener = fileExplorerService.onTerminalExit((id) => {
      if (sessionIdRef.current === id) onExit();
    });

    // Registered up front too, not inside the invoke().then() below — the
    // old code only started forwarding resize events *after* the backend
    // session existed, which meant the very first resize (xterm settling to
    // the panel's real pixel size, right after fit.fit() above) never
    // reached the PTY. The PTY stayed at whatever size terminal_open started
    // it at while xterm displayed a different size, and PowerShell's
    // line-editor (which redraws based on terminal width) visibly corrupted
    // the prompt as a result — passing term.cols/term.rows into openTerminal
    // below fixes the starting size, and this fixes every resize after that.
    term.onData((data) => {
      if (sessionIdRef.current !== null) fileExplorerService.writeTerminal(sessionIdRef.current, data).catch(() => {});
    });
    term.onResize(({ cols, rows }) => {
      if (sessionIdRef.current !== null) {
        fileExplorerService.resizeTerminal(sessionIdRef.current, cols, rows).catch(() => {});
      }
    });

    fileExplorerService
      .openTerminal(cwd, term.cols, term.rows)
      .then((id) => {
        // The hook was unmounted (or asked for a different cwd) before the
        // backend finished spawning this one — close it immediately instead
        // of leaking a shell nothing will ever read from again.
        if (cancelled) {
          fileExplorerService.closeTerminal(id).catch(() => {});
          return;
        }
        sessionIdRef.current = id;
      })
      // Surfaced two ways: written straight into the (otherwise silently
      // empty-looking) terminal area itself, and into the app's global error
      // banner — a failed invoke() here used to disappear as an unhandled
      // promise rejection with no visible sign the panel had done anything.
      .catch((e) => {
        if (cancelled) return;
        console.error("terminal_open failed", e);
        term.write(`\x1b[31mFailed to open terminal: ${String(e)}\x1b[0m\r\n`);
        useFileExplorerStore.setState({ error: `Failed to open terminal: ${String(e)}` });
      });

    // The panel's own height-drag resize doesn't need its own separate
    // effect — resizing the outer panel changes this container's rendered
    // size too, which this same observer already picks up, so a second
    // fit() keyed on the drag height would just be redundant work on every
    // pointermove during a drag.
    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      outputListener.then((unlisten) => unlisten()).catch(() => {});
      exitListener.then((unlisten) => unlisten()).catch(() => {});
      if (sessionIdRef.current !== null) fileExplorerService.closeTerminal(sessionIdRef.current).catch(() => {});
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  return { containerRef };
}
