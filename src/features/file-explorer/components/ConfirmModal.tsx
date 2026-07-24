import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

// Yes/no confirmation, not a text-input prompt — a separate component from
// PromptModal rather than shoehorning an optional field into it.
export function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Only Escape (deliberate) dismisses, and not once a delete is in flight —
    // a backdrop click never does, so an accidental outside click can't cancel.
    if (e.key === "Escape" && !submitting) onCancel();
  }

  return (
    <div className="animate-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="animate-dialog-in flex w-80 flex-col gap-4 rounded-lg border border-surface-container-highest bg-surface-container-high p-4 shadow-lg"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0 text-error" />
          <span id="confirm-modal-title" className="truncate text-[13px] font-medium text-on-surface">
            {title}
          </span>
        </div>

        <p className="text-[13px] text-on-surface-variant">{message}</p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className={`rounded border border-surface-container-highest px-3 py-1.5 text-[12px] text-outline transition-colors duration-150 hover:border-primary-container hover:text-on-surface ${focusRing}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={submitting}
            className={`rounded bg-error-container px-3 py-1.5 text-[12px] font-medium text-on-error-container transition-colors duration-150 hover:bg-error-container/90 disabled:cursor-default disabled:opacity-60 ${focusRing}`}
            onClick={handleConfirm}
          >
            {submitting ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
