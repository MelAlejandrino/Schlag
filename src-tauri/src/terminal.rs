// A real in-app terminal (PowerShell over a PTY), not a shell-out to
// `cmd.exe` — the frontend renders the PTY's output through xterm.js
// (TerminalPanel.tsx) and forwards keystrokes back here.
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

// One fixed event name per kind, with `id` embedded in the payload, rather
// than a dynamic `terminal-output-{id}`/`terminal-exit-{id}` name per
// session. The old per-id scheme required the frontend to already know its
// session's id before it could `listen()` — meaning it could only register
// after `terminal_open` resolved, by which point the backend's reader thread
// (started before terminal_open even returns) could already have emitted and
// lost an early event, most damaging for terminal-exit (a shell that exits
// abnormally fast could leave the panel stuck open forever showing a dead
// shell with no error). A fixed event name lets the frontend register its
// listener immediately at mount, in parallel with the (much slower) PTY
// spawn, and filter by id client-side — closing the race in practice instead
// of just narrowing it.
#[derive(Clone, Serialize)]
struct TerminalOutput {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: u32,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

// ponytail: one live session at a time, matching the single bottom-docked
// terminal panel the UI shows — opening a new one kills whatever was
// running. Upgrade to a HashMap<id, TerminalSession> if multiple concurrent
// terminal panels are ever built.
#[derive(Default)]
pub struct TerminalManager {
    // The id counter and the active session share one lock (rather than a
    // separate AtomicU32 alongside a separate Mutex<Option<...>>) because
    // reserving an id and deciding whether it's still current always need to
    // be checked together — see reserve_id/is_current below, which is what
    // closes the race two overlapping terminal_open calls used to hit (a
    // slow-to-spawn request finishing after a newer one, silently killing the
    // session the user actually asked for last with no error surfaced).
    state: Mutex<(u32, Option<(u32, TerminalSession)>)>,
}

// Every command here uses `unwrap_or_else(|poisoned| poisoned.into_inner())`
// instead of `.unwrap()` on the lock — recovering the guard even if some
// future change causes a panic while it's held, rather than permanently
// poisoning the mutex and crashing every subsequent terminal command (and,
// since these are Tauri commands running on the IPC thread pool, the whole
// app) the way a bare `.unwrap()` would. None of the locked sections here do
// anything that would leave the guarded state invalid after a mid-way panic.
impl TerminalManager {
    fn lock(&self) -> std::sync::MutexGuard<'_, (u32, Option<(u32, TerminalSession)>)> {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    // Reserves the next id up front — before any of terminal_open's slow PTY
    // work — so id order reflects call order, not spawn-completion order.
    fn reserve_id(&self) -> u32 {
        let mut guard = self.lock();
        guard.0 += 1;
        guard.0
    }

    // True only if no *other* terminal_open call has reserved a newer id
    // since this one started. Called after the slow spawn work finishes, so
    // whichever call was issued last always wins regardless of which one's
    // `powershell.exe` process actually finished launching first.
    fn is_current(&self, id: u32) -> bool {
        self.lock().0 == id
    }

    fn install(&self, id: u32, session: TerminalSession) {
        let mut guard = self.lock();
        if let Some((_, mut old)) = guard.1.take() {
            let _ = old.child.kill();
        }
        guard.1 = Some((id, session));
    }

    fn with_current<T>(&self, id: u32, f: impl FnOnce(&mut TerminalSession) -> T) -> Option<T> {
        let mut guard = self.lock();
        match guard.1.as_mut() {
            Some((sid, session)) if *sid == id => Some(f(session)),
            _ => None,
        }
    }

    fn close_if_current(&self, id: u32) {
        let mut guard = self.lock();
        if matches!(guard.1.as_ref(), Some((sid, _)) if *sid == id) {
            if let Some((_, mut session)) = guard.1.take() {
                let _ = session.child.kill();
            }
        }
    }
}

#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    state: State<TerminalManager>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<u32, String> {
    let id = state.reserve_id();

    let pty_system = native_pty_system();
    // Spawned at the frontend's already-computed xterm size (not a hardcoded
    // guess) — PowerShell's own line-editor redraws based on terminal width,
    // so starting at the wrong size caused visible corruption (overtyping
    // the prompt, stray newlines) until the first resize event corrected it.
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.cwd(&cwd);
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave side belongs to the child process now; dropping our end here
    // (rather than holding it for the session's lifetime) matches
    // portable-pty's own examples.
    drop(pair.slave);

    // If either of these fails, `child` is already a real running process —
    // dropping it here (portable-pty's Child has no kill-on-drop) would leak
    // an orphaned, untracked powershell.exe with nothing left to close it.
    let mut reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            let _ = child.kill();
            return Err(e.to_string());
        }
    };
    let writer = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            let _ = child.kill();
            return Err(e.to_string());
        }
    };

    // A newer terminal_open call may have already reserved a higher id while
    // this one was busy spawning — if so, this request lost the race, and
    // installing it anyway would silently kill the session the user actually
    // asked for last. Kill what was just spawned instead of storing it.
    if !state.is_current(id) {
        let _ = child.kill();
        return Err("superseded by a newer terminal request".to_string());
    }
    state.install(
        id,
        TerminalSession {
            master: pair.master,
            writer,
            child,
        },
    );

    // One reader thread per session, draining the PTY and emitting chunks to
    // the frontend as they arrive — same bare-OS-thread style the indexer
    // already uses instead of pulling in tokio for one blocking read loop.
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        // Bytes read but not yet valid UTF-8 as of the last chunk — a
        // multi-byte character can straddle two separate PTY reads, and
        // decoding each chunk independently (the original approach) replaced
        // the truncated bytes on both sides with U+FFFD, permanently
        // corrupting that character instead of just waiting for the rest of
        // it on the next read.
        let mut leftover: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    leftover.extend_from_slice(&buf[..n]);
                    let text = match std::str::from_utf8(&leftover) {
                        Ok(s) => {
                            let s = s.to_string();
                            leftover.clear();
                            s
                        }
                        Err(e) => {
                            let valid_up_to = e.valid_up_to();
                            let mut text = String::from_utf8_lossy(&leftover[..valid_up_to]).into_owned();
                            let rest = leftover.split_off(valid_up_to);
                            // A UTF-8 sequence is at most 4 bytes — if more
                            // than that is still unparsed, it isn't a
                            // sequence waiting for its next byte, it's
                            // genuinely invalid input; flush it lossily
                            // instead of buffering forever.
                            if rest.len() >= 4 {
                                text.push_str(&String::from_utf8_lossy(&rest));
                                leftover.clear();
                            } else {
                                leftover = rest;
                            }
                            text
                        }
                    };
                    if !text.is_empty() && app.emit("terminal-output", TerminalOutput { id, data: text }).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        // Self-heal state immediately rather than waiting on the frontend's
        // exit-event round-trip to eventually call terminal_close — without
        // this, a naturally-exited (or errored-out) session's stale
        // master/writer/child sat in `state` until some *later* command
        // happened to touch it, during which a stray terminal_write/resize
        // against this same id could write into an already-dead pipe.
        // `app.state::<TerminalManager>()` re-derives a handle to the same
        // managed instance `state: State<TerminalManager>` pointed at above —
        // the original `State` guard isn't `'static` and can't be moved into
        // this thread directly, but the `AppHandle` already captured for
        // `emit` can hand out a fresh one.
        app.state::<TerminalManager>().close_if_current(id);
        let _ = app.emit("terminal-exit", TerminalExit { id });
    });

    Ok(id)
}

#[tauri::command]
pub fn terminal_write(state: State<TerminalManager>, id: u32, data: String) -> Result<(), String> {
    // A stale id (already replaced or closed) has nothing to write to —
    // matches the frontend's own fire-and-forget `.catch(() => {})` on this
    // call, so this deliberately isn't an error.
    state
        .with_current(id, |session| session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string()))
        .unwrap_or(Ok(()))
}

#[tauri::command]
pub fn terminal_resize(state: State<TerminalManager>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    state
        .with_current(id, |session| {
            session
                .master
                .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                .map_err(|e| e.to_string())
        })
        .unwrap_or(Ok(()))
}

#[tauri::command]
pub fn terminal_close(state: State<TerminalManager>, id: u32) -> Result<(), String> {
    state.close_if_current(id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // The session-installation race (a slow terminal_open finishing after a
    // newer one) only needs the id-generation bookkeeping to be correct —
    // TerminalSession itself holds real portable-pty trait objects with no
    // in-memory fake, so only reserve_id/is_current (the part that actually
    // decides who wins) is unit-tested here; exercising a real installed
    // session needs a real spawned PTY, which is exactly the kind of
    // slow/flaky-in-CI dependency this codebase's other test modules avoid.

    #[test]
    fn reserve_id_is_monotonic() {
        let mgr = TerminalManager::default();
        let a = mgr.reserve_id();
        let b = mgr.reserve_id();
        let c = mgr.reserve_id();
        assert!(a < b);
        assert!(b < c);
    }

    #[test]
    fn is_current_is_true_only_for_the_most_recently_reserved_id() {
        let mgr = TerminalManager::default();
        let a = mgr.reserve_id();
        assert!(mgr.is_current(a));

        let b = mgr.reserve_id();
        // `a` lost the race the moment a newer id was reserved — a
        // slow-to-spawn terminal_open call for `a` must not install itself
        // over whatever `b` ends up installing.
        assert!(!mgr.is_current(a));
        assert!(mgr.is_current(b));
    }

    #[test]
    fn with_current_and_close_ignore_a_stale_id() {
        let mgr = TerminalManager::default();
        // No session installed at all yet — every lookup against any id is
        // a clean miss, not a panic.
        assert_eq!(mgr.with_current(1, |_| ()), None);
        mgr.close_if_current(1); // must not panic on an empty slot
    }
}
