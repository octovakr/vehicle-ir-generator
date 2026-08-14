import React, { useEffect, useState } from 'react';

/** Collapsible control-panel section. */
export function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button className="section-header" onClick={() => setOpen((v) => !v)}>
        {title}
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

/**
 * Numeric input that keeps invalid intermediate text locally (so the user can
 * type freely) and only commits parseable values that pass `validate`.
 * Invalid entries are highlighted, never silently clamped (rule 17).
 */
export function NumberField({
  label,
  value,
  onCommit,
  step,
  min,
  max,
  unit,
  title,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  title?: string;
}): React.JSX.Element {
  const [text, setText] = useState(formatNumber(value));
  const [invalid, setInvalid] = useState(false);

  // Sync when the committed value changes externally (e.g. zone preset).
  useEffect(() => {
    setText(formatNumber(value));
    setInvalid(false);
  }, [value]);

  const handleChange = (raw: string): void => {
    setText(raw);
    const parsed = Number(raw);
    const ok =
      raw.trim() !== '' &&
      Number.isFinite(parsed) &&
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max);
    setInvalid(!ok);
    if (ok) onCommit(parsed);
  };

  return (
    <div className="field" title={title}>
      <label>
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        type="number"
        className={invalid ? 'invalid' : ''}
        value={text}
        step={step}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          if (invalid) {
            setText(formatNumber(value));
            setInvalid(false);
          }
        }}
      />
    </div>
  );
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

/** Labeled select. */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  title,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  title?: string;
}): React.JSX.Element {
  return (
    <div className="field" title={title}>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
