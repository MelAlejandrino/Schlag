import { useEffect, useState } from "react";
import { fileExplorerService } from "../services/file-explorer.service";
import type { IndexStatus } from "../file-explorer.types";

// Polls the Phase 2 background indexer's status while it's scanning, then
// stops — this app has no way to be told "the scan finished," only asked.
const POLL_INTERVAL_MS = 1500;

export function useIndexStatus(): IndexStatus | null {
  const [status, setStatus] = useState<IndexStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function poll() {
      const next = await fileExplorerService.indexStatus().catch(() => null);
      if (cancelled || !next) return;
      setStatus(next);
      if (!next.scanning && intervalId) clearInterval(intervalId);
    }

    poll();
    intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return status;
}
