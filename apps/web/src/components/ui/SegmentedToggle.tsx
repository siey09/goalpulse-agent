export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** A pill-group range switch, generalized from the match-status filter buttons already hand-built in LiveMarketsPage's Market Board. */
export function SegmentedToggle<T extends string>({ options, value, onChange }: SegmentedToggleProps<T>) {
  return (
    <div className="inline-flex gap-1.5 rounded-xl bg-black/20 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={`rounded-xl px-2.5 py-1.5 text-[10px] font-semibold transition ${
            option.value === value ? "bg-accent/15 text-accent-200" : "text-stone-500 hover:bg-white/6 hover:text-stone-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
