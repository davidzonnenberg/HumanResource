// Phone segmented control (ceo-phone 13.3, 14.1): a group of buttons with aria-pressed.
export function Segmented<V extends string>({ value, options, onChange, label }: { value: V; options: readonly { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return (
    <div className="ph-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
