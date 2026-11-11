import { Children, isValidElement, type ButtonHTMLAttributes, type ChangeEvent, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useHref, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useMd } from './useMd';
import './md';
import { t } from '../i18n';

type Variant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';

const BUTTON_TAG: Record<Variant, string> = {
  filled: 'md-filled-button',
  tonal: 'md-filled-tonal-button',
  outlined: 'md-outlined-button',
  text: 'md-text-button',
  danger: 'md-filled-button',
};

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  danger?: boolean;
}

function ButtonBody({ icon, loading, children }: { icon?: IconName; loading?: boolean; children?: ReactNode }) {
  return (
    <>
      {loading ? <md-circular-progress slot="icon" indeterminate="" aria-label={t('Loading')} class="md-spin" /> : icon ? <span slot="icon" className="md-slot"><Icon name={icon} size={18} /></span> : null}
      {children}
    </>
  );
}

export function Button({ variant = 'filled', icon, loading, danger, className = '', children, disabled, type = 'button', ...rest }: BtnProps) {
  const Tag = BUTTON_TAG[variant] as any;
  const ref = useMd({ disabled: !!(disabled || loading), type });
  const isDanger = danger || variant === 'danger';
  return (
    <Tag ref={ref} {...(rest as object)} class={`md-btn ${isDanger ? `md-danger md-danger-${variant === 'danger' ? 'filled' : variant}` : ''} ${!children ? 'icon-only' : ''} ${className}`}>
      <ButtonBody icon={icon} loading={loading}>{children}</ButtonBody>
    </Tag>
  );
}

export function LinkButton({ variant = 'filled', icon, children, className = '', to }: { to: string; variant?: Variant; icon?: IconName; children?: ReactNode; className?: string }) {
  const Tag = BUTTON_TAG[variant] as any;
  const href = useHref(to);
  const nav = useNavigate();
  return (
    <Tag
      href={href}
      class={`md-btn ${className}`}
      onClick={(e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        nav(to);
      }}
    >
      <ButtonBody icon={icon}>{children}</ButtonBody>
    </Tag>
  );
}

export function IconButton({ icon, label, className = '', disabled, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useMd({ disabled: !!disabled });
  return (
    <md-icon-button ref={ref} {...(rest as object)} class={className} aria-label={label} title={label}>
      <Icon name={icon} />
    </md-icon-button>
  );
}

export function Fab({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  const href = useHref(to);
  const nav = useNavigate();
  return (
    <a
      href={href}
      className="fab"
      aria-label={label}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        nav(to);
      }}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </a>
  );
}

interface FieldBase {
  label: string;
  error?: string | null;
  help?: string;
}

type FieldRest<E extends HTMLElement> = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'ref'> & { onChange?(e: ChangeEvent<E>): void };

function asChange<E extends HTMLElement>(el: EventTarget | null) {
  return { target: el, currentTarget: el } as unknown as ChangeEvent<E>;
}

/** Text-like props that map onto md-outlined-text-field properties. */
function fieldProps(rest: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = { autoComplete: 'autocomplete', readOnly: 'readOnly', maxLength: 'maxLength', inputMode: 'inputMode' };
  for (const k of ['value', 'type', 'disabled', 'readOnly', 'maxLength', 'min', 'max', 'step', 'required', 'placeholder', 'name', 'autoComplete', 'inputMode', 'pattern']) {
    if (k in rest && rest[k] !== undefined) out[map[k] ?? k] = rest[k];
  }
  return out;
}

export function TextField({ label, error, help, className = '', onChange, ...rest }: FieldBase & FieldRest<HTMLInputElement> & { className?: string }) {
  const ref = useMd(
    { label, error: !!error, errorText: error ?? '', supportingText: help ?? '', ...fieldProps(rest as Record<string, unknown>) },
    { input: (e) => onChange?.(asChange<HTMLInputElement>(e.target)) },
  );
  return <md-outlined-text-field ref={ref} class={`md-field ${className}`} />;
}

export function TextArea({ label, error, help, className = '', onChange, ...rest }: FieldBase & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & { onChange?(e: ChangeEvent<HTMLTextAreaElement>): void }) {
  const ref = useMd(
    { label, error: !!error, errorText: error ?? '', supportingText: help ?? '', type: 'textarea', rows: rest.rows ?? 4, ...fieldProps(rest as Record<string, unknown>) },
    { input: (e) => onChange?.(asChange<HTMLTextAreaElement>(e.target)) },
  );
  return <md-outlined-text-field ref={ref} class={`md-field ${className}`} />;
}

export function SelectField({ label, error, help, className = '', children, onChange, value, disabled, required }: FieldBase & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange?(e: ChangeEvent<HTMLSelectElement>): void }) {
  const ref = useMd(
    { label, error: !!error, errorText: error ?? '', supportingText: help ?? '', value: value === undefined ? undefined : String(value), disabled: !!disabled, required: !!required },
    { change: (e) => onChange?.(asChange<HTMLSelectElement>(e.target)) },
  );
  const opts = Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>[];
  return (
    <md-outlined-select ref={ref} class={`md-field ${className}`}>
      {opts.map((o, i) => {
        const text = Children.toArray(o.props.children).join('');
        const v = o.props.value !== undefined ? String(o.props.value) : text;
        return (
          <md-select-option key={o.key ?? i} value={v} {...(o.props.disabled ? { disabled: '' } : {})}>
            <div slot="headline">{text}</div>
          </md-select-option>
        );
      })}
    </md-outlined-select>
  );
}

/** Date/time pickers use the browser's native pickers inside Material text fields. */
export const DateField = (p: FieldBase & Omit<FieldRest<HTMLInputElement>, 'type'> & { className?: string }) => <TextField {...p} type="date" />;
export const TimeField = (p: FieldBase & Omit<FieldRest<HTMLInputElement>, 'type'> & { className?: string }) => <TextField {...p} type="time" />;

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; disabled?: boolean }) {
  const ref = useMd({ selected: checked, disabled: !!disabled, icons: true }, { change: (e) => onChange((e.target as unknown as { selected: boolean }).selected) });
  return (
    <label className="md-switch-row">
      <md-switch ref={ref} />
      <span>{label}</span>
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange(v: boolean): void; label: ReactNode; disabled?: boolean }) {
  const ref = useMd({ checked, disabled: !!disabled }, { change: (e) => onChange((e.target as unknown as { checked: boolean }).checked) });
  return (
    <label className="md-check-row">
      <md-checkbox ref={ref} touch-target="wrapper" />
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
