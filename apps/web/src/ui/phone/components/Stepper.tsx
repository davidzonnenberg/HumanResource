// Phone stepper (ceo-phone 14.2): − / value / +, clamped to [min, max] by `step`, disabled at limits.
import { t } from '../../../text/t';

export function clampStep(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

export function Stepper({ value, min, max, step, onChange, display, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; display?: string; label: string }) {
  return (
    <span className="ph-stepper" role="group" aria-label={label}>
      <button type="button" className="ph-icon" aria-label={t('phone.stepper.less')} disabled={value <= min} onClick={() => onChange(clampStep(value, -step, min, max))}>
        −
      </button>
      <b aria-live="polite">{display ?? String(value)}</b>
      <button type="button" className="ph-icon" aria-label={t('phone.stepper.more')} disabled={value >= max} onClick={() => onChange(clampStep(value, step, min, max))}>
        +
      </button>
    </span>
  );
}
