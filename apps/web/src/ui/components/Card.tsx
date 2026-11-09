// Shared Panel building blocks (18.7, 18.8): side sheet <= 40% width, cards with <= 8 rows, no
// tables, touch targets >= 44px. All labels come from t() at the call sites.
import type { ReactNode } from 'react';
import { t } from '../../text/t';

export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="panel" role="dialog" aria-label={title}>
      <header className="panel-head">
        <h2>{title}</h2>
        <button className="panel-close" onClick={onClose} aria-label={t('panel.close')}>
          ×
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </aside>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {title && <h3 className="card-title">{title}</h3>}
      {children}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{value}</span>
    </div>
  );
}

export function Bar({ amount, capacity, over }: { amount: number; capacity: number; over?: boolean }) {
  const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
  return (
    <div className={`bar ${over ? 'over' : ''}`}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PanelButton({ onClick, kind = 'default', disabled, children }: { onClick: () => void; kind?: 'default' | 'primary' | 'danger'; disabled?: boolean; children: ReactNode }) {
  return (
    <button className={`panel-button ${kind}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
