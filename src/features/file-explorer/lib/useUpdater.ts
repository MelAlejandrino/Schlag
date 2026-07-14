import { useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

/** Checks GitHub Releases (via tauri-plugin-updater, see tauri.conf.json's
 * `plugins.updater.endpoints`) for a newer signed build, downloads it, and
 * relaunches into it — mirrors useIndexStatus.ts's shape (own useState, no
 * store involvement, since only SettingsPage's About section consumes this). */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkForUpdate() {
    setStatus("checking");
    setError(null);
    try {
      const found = await check();
      setUpdate(found);
      setStatus(found ? "available" : "up-to-date");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  async function downloadAndInstall() {
    if (!update) return;
    setStatus("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return { status, update, error, checkForUpdate, downloadAndInstall, relaunch };
}
