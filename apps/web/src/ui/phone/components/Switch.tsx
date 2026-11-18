// Phone switch (ceo-phone 13.3, 14.1): role="switch" + aria-checked, 44 px target.
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`ph-switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="ph-switch-track" aria-hidden="true" />
    </button>
  );
}
