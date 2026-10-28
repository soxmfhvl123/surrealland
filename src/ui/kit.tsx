import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Small shared controls so every panel looks and behaves the same. */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  def?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step, unit, def, format, onChange }: SliderProps) {
  const v = Number.isFinite(value) ? value : (def ?? min);
  return (
    <div className="ctl">
      <div className="ctl-head">
        <label onDoubleClick={() => def !== undefined && onChange(def)} title={def !== undefined ? '더블클릭하면 기본값' : undefined}>
          {label}
        </label>
        <span className="ctl-val">
          {format ? (
            <span className="ctl-fmt">{format(v)}</span>
          ) : (
            <>
              <input
                type="number"
                value={v}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
                }}
              />
              {unit}
            </>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => def !== undefined && onChange(def)}
        style={{ ['--fill' as string]: `${((v - min) / (max - min)) * 100}%` }}
      />
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`seg ${small ? 'small' : ''}`} role="group">
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="ctl toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i className="toggle" />
    </label>
  );
}

/** Collapsible group; `open` sets the initial state. */
export function Section({ title, open = true, extra, children }: { title: string; open?: boolean; extra?: ReactNode; children: ReactNode }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <section className={`sec ${isOpen ? 'open' : ''}`}>
      <button className="sec-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}>
        <ChevronDown size={14} className="sec-chev" />
        <span>{title}</span>
        {extra && (
          <span className="sec-extra" onClick={(e) => e.stopPropagation()}>
            {extra}
          </span>
        )}
      </button>
      {isOpen && <div className="sec-body">{children}</div>}
    </section>
  );
}

export function PanelHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="panel-head-actions">{actions}</div>}
    </div>
  );
}
