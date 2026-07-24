import { Loader2 } from "lucide-react";
import { useIndexStatus } from "../lib/useIndexStatus";

export function IndexStatusBadge() {
  const indexStatus = useIndexStatus();
  if (!indexStatus?.scanning) return null;

  return (
    <span
      role="status"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-surface-container-highest bg-surface-container-high px-2.5 py-1.5 font-mono text-[11px] text-outline shadow-lg"
      title="Building the file index in the background"
    >
      <Loader2 size={13} strokeWidth={2} className="animate-spin" />
      Indexing… {indexStatus.indexed_count.toLocaleString()}
    </span>
  );
}
