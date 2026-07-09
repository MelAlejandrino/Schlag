import { useEffect, useRef, useState, type ComponentType, type FormEvent, type KeyboardEvent } from "react";
import { Combobox } from "./Combobox";

export interface PromptModalConfig {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  confirmLabel: string;
  validate?: (value: string) => string | null;
  // Presence (not just non-empty) decides plain input vs Combobox — an
  // empty array still means "give the user a picker with nothing in it yet".
  suggestions?: string[];
}

interface PromptModalProps extends PromptModalConfig {
  onConfirm: (value: string) => Promise<void>;
  onCancel: () => void;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

// Generalized from what was originally a New-Folder/New-File-only modal:
// rename and the copy/move destination picker are the same shape (icon +
// label + one text field + validate + Cancel/Confirm), just with different
// copy, initial value, validation rules, and — for copy/move — a folder
// suggestion list instead of a plain text field. One component, one focus
// trap, one animation pair, instead of four near-identical dialogs.
export function PromptModal({
  icon: Icon,
  title,
  label,
  initialValue,
  placeholder,
  confirmLabel,
  validate,
  suggestions,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Combobox manages its own input internally (no ref to reach in) — it
  // takes autoFocus directly instead. Only the plain-input path also
  // selects the text, so renaming can start by just typing over it.
  useEffect(() => {
    if (suggestions) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validate?.(value) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(value.trim());
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  }

  // Keeps Tab cycling inside the dialog instead of escaping to whatever's
  // behind the backdrop, and Escape cancels from anywhere in the form.
  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Escape") {
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const focusables = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input, button"));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const fieldClass = `w-full rounded border bg-surface-container px-2.5 py-1.5 text-[13px] text-on-surface outline-none transition-colors duration-150 ${
    error ? "border-error focus:border-error" : "border-surface-container-highest focus:border-primary-container"
  }`;

  function updateValue(v: string) {
    setValue(v);
    if (error) setError(null);
  }

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
        className="animate-dialog-in flex w-80 flex-col gap-4 rounded-lg border border-surface-container-highest bg-surface-container-high p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2">
          <Icon size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
          <span id="prompt-modal-title" className="truncate text-[13px] font-medium text-on-surface">
            {title}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wide text-outline">{label}</span>
          {suggestions ? (
            <Combobox
              className={fieldClass}
              placeholder={placeholder}
              options={suggestions}
              value={value}
              onChange={updateValue}
              autoFocus
            />
          ) : (
            <input
              ref={inputRef}
              className={fieldClass}
              placeholder={placeholder}
              value={value}
              onChange={(e) => updateValue(e.currentTarget.value)}
            />
          )}
          {error && <span className="text-[11px] text-error">{error}</span>}
        </label>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className={`rounded border border-surface-container-highest px-3 py-1.5 text-[12px] text-outline transition-colors duration-150 hover:border-primary-container hover:text-on-surface ${focusRing}`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={`rounded bg-primary-container px-3 py-1.5 text-[12px] font-medium text-white transition-colors duration-150 hover:bg-primary-container/90 disabled:cursor-default disabled:opacity-60 ${focusRing}`}
          >
            {submitting ? "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
