import { useEffect, useState } from "react";
import { ArrowDownToLine, RefreshCw, X } from "lucide-react";
import { useUpdater } from "../lib/useUpdater";

export function UpdateBanner() {
  const { status, update, checkForUpdate, downloadAndInstall } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  // Auto-check for updates once on mount so the banner surfaces immediately
  // on app open — the SettingsPage's manual "Check for Updates" button is
  // a separate call triggered by user action, not this.
  useEffect(() => {
    checkForUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed || status !== "available" || !update) {
    return null;
  }

  const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface";

  return (
    <div className="m-3 flex shrink-0 items-start gap-3 rounded-lg border border-primary-container/40 bg-primary-container/10 px-3 py-2.5 text-on-surface">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[12px] text-on-surface">
          A new version is available — you're on {update.currentVersion}, and version {update.version} is ready to download.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadAndInstall}
            className={`flex w-fit items-center gap-1.5 rounded bg-primary-container px-2.5 py-1 text-[11px] font-medium text-white transition-colors duration-150 hover:bg-primary-container/90 ${focusRing}`}
          >
            <ArrowDownToLine size={12} strokeWidth={2} />
            Download and Install
          </button>
          <button
            type="button"
            onClick={checkForUpdate}
            className={`flex w-fit items-center gap-1.5 rounded border border-surface-container-highest bg-surface-container px-2.5 py-1 text-[11px] text-on-surface transition-colors duration-150 hover:border-primary-container ${focusRing}`}
          >
            <RefreshCw size={12} strokeWidth={2} />
            Check again
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className={`shrink-0 rounded p-0.5 text-outline transition-colors duration-150 hover:bg-primary-container/20 hover:text-on-surface ${focusRing}`}
        title="Dismiss"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
