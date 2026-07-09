import { useState } from "react";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  // The dropdown can show something friendlier than the raw option string
  // (e.g. a folder's own name instead of its full path) without changing
  // what actually gets written back via onChange — the input's own value
  // stays the real option text, only the suggestion list's label differs.
  getOptionLabel?: (option: string) => string;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high";

// A styleable stand-in for <input list> + <datalist>: native datalist options
// render as unstyleable browser chrome, which doesn't fit a hand-designed
// panel. Still a free-text field — options are suggestions, not a closed set.
export function Combobox({ value, onChange, options, placeholder, className, autoFocus, getOptionLabel }: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const label = getOptionLabel ?? ((option: string) => option);

  const filtered = value
    ? options.filter(
        (o) => o.toLowerCase().includes(value.toLowerCase()) || label(o).toLowerCase().includes(value.toLowerCase()),
      )
    : options;

  function choose(option: string) {
    onChange(option);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        // Closing on blur (rather than a window click listener) is what
        // makes picking an option work at all: an ancestor panel here stops
        // click propagation at its own root, so a window-level listener
        // would never see clicks on other fields in the same panel.
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.currentTarget.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onKeyDown={(e) => {
          if (!open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") setOpen(true);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && filtered[highlighted]) {
            e.preventDefault();
            choose(filtered[highlighted]);
          } else if (e.key === "Escape") {
            // Only swallow Escape while our own dropdown is actually open —
            // otherwise it needs to keep bubbling (e.g. to a parent modal's
            // own Escape-to-cancel), not just always stop here.
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div className="themed-scroll absolute left-0 right-0 top-[calc(100%+4px)] z-10 max-h-36 overflow-y-auto rounded-md border border-surface-container-highest bg-surface-container-high py-1 shadow-lg">
          {filtered.map((option, i) => (
            <button
              key={option}
              type="button"
              // preventDefault on mousedown keeps the input focused, so the
              // subsequent click fires before onBlur would close the list.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(option)}
              onMouseEnter={() => setHighlighted(i)}
              className={`block w-full truncate px-2 py-1 text-left text-[12px] transition-colors duration-100 ${focusRing} ${
                i === highlighted ? "bg-primary-container/20 text-on-surface" : "text-on-surface hover:bg-surface-container-highest"
              }`}
            >
              {label(option)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
