// Single source of truth for the GitHub repo identity, so the Settings links
// (and any future reference) stay in sync.
//
// NOTE: the auto-updater endpoint in src-tauri/tauri.conf.json is deliberately
// NOT derived from this — it's static JSON compiled into the binary at build
// time and can't read a JS constant. If the repo ever moves, update that file
// too (see CLAUDE.md's Auto updates note).
export const REPO_OWNER = "MelAlejandrino";
export const REPO_NAME = "Schlag";
export const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
export const OWNER_URL = `https://github.com/${REPO_OWNER}`;
