import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { t } from '../i18n';

type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  danger?: boolean;
}

export function Button({ variant = 'filled', icon, loading, danger, className = '', children, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`btn btn-${variant} ${danger ? 'danger' : ''} ${!children ? 'icon-only' : ''} ${className}`}
    >
      {loading ? <span className="spinner" role="status" aria-label={t('Loading')} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ variant = 'filled', icon, children, className = '', ...rest }: LinkProps & { variant?: Variant; icon?: IconName }) {
  return (
    <Link {...rest} className={`btn btn-${variant} ${className}`}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`btn btn-text icon-only ${rest.className ?? ''}`} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}

export function Fab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="fab" aria-label={label}>
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}

interface FieldBase {
  label: string;
  error?: string | null;
  help?: string;
}

export const TextField = forwardRef<HTMLInputElement, FieldBase & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, help, className = '', ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <div className="field-box">
        <input ref={ref} id={id} placeholder=" " aria-invalid={!!error} aria-describedby={`${id}-s`} {...rest} />
        <label htmlFor={id}>{label}</label>
      </div>
      {(error || help) && (
        <span className="support" id={`${id}-s`}>
          {error ?? help}
        </span>
      )}
    </div>
  );
});

export function TextArea({ label, error, help, className = '', ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <div className="field-box">
        <textarea id={id} placeholder=" " aria-invalid={!!error} {...rest} />
        <label htmlFor={id}>{label}</label>
      </div>
      {(error || help) && <span className="support">{error ?? help}</span>}
    </div>
  );
}

export function SelectField({ label, error, help, className = '', children, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`field ${error ? 'invalid' : ''} ${className}`}>
      <div className="field-box">
        <select id={id} {...rest}>
          {children}
        </select>
        <label htmlFor={id}>{label}</label>
      </div>
      {(error || help) && <span className="support">{error ?? help}</span>}
    </div>
  );
}

/** Date/time pickers use the browser's native Material-styled-by-OS pickers inside M3 text fields. */
export const DateField = (p: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => <TextField {...p} type="date" />;
export const TimeField = (p: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => <TextField {...p} type="time" />;

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track">
        <span className="thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange(v: T): void; options: { value: T; label: string; icon?: IconName }[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {value === o.value ? <Icon name="check" size={18} /> : o.icon ? <Icon name={o.icon} size={18} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({ selected, onClick, children }: { selected: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onClick}>
      {selected && <Icon name="check" size={16} />}
      {children}
    </button>
  );
}

export function Badge({ status, children }: { status?: string; children?: ReactNode }) {
  return <span className={`badge ${status ? `s-${status}` : ''}`}>{children ?? (status ? t(status) : status)}</span>;
}

export function Card({ variant = 'filled', className = '', children, onClick }: { variant?: 'filled' | 'elevated' | 'outlined' | 'tonal-primary'; className?: string; children: ReactNode; onClick?(): void }) {
  const cls = `card ${variant === 'filled' ? '' : variant} ${onClick ? 'clickable' : ''} ${className}`;
  return onClick ? (
    <div className={cls} role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}>
      {children}
    </div>
  ) : (
    <div className={cls}>{children}</div>
  );
}
