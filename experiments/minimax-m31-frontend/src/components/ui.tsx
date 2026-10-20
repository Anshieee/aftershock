import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId, useState } from 'react';

/* ------------------------------------------------------------------ *
 * Buttons — deliberately compact. The interface earns its emphasis from
 * spacing and typography rather than from large, loud calls to action.
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-swift select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-paper-raised border border-brand hover:bg-brand-deep hover:border-brand-deep shadow-lift-1 active:translate-y-px',
  secondary:
    'bg-paper-raised text-ink border border-ink-border hover:bg-paper-deep hover:border-ink-soft/60 shadow-lift-1 active:translate-y-px',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:bg-ink/[0.055] hover:text-ink',
  danger:
    'bg-transparent text-notice border border-notice/35 hover:bg-notice/[0.08] hover:border-notice/60',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-2xs',
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3.5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon,
  trailing,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
      {trailing}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  active?: boolean;
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'sm',
  active = false,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const dimension = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`${BUTTON_BASE} ${dimension} ${BUTTON_VARIANT[variant]} ${
        active ? 'bg-brand-soft text-brand-deep border-brand-line' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Chip — a small semantic marker. Used sparingly.
 * ------------------------------------------------------------------ */

export type ChipTone = 'notice' | 'amber' | 'sage' | 'uncertain' | 'brand' | 'neutral';

const CHIP_TONE: Record<ChipTone, string> = {
  notice: 'bg-notice-surface text-notice-deep border-notice-line',
  amber: 'bg-amber-surface text-amber-deep border-amber-line',
  sage: 'bg-sage-surface text-sage-deep border-sage-line',
  uncertain: 'bg-uncertain-surface text-uncertain-deep border-uncertain-line',
  brand: 'bg-brand-soft text-brand-deep border-brand-line',
  neutral: 'bg-ink/[0.045] text-ink-muted border-ink-border',
};

export function Chip({
  tone = 'neutral',
  children,
  className = '',
  dot = false,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[1px] text-2xs font-medium leading-4 ${CHIP_TONE[tone]} ${className}`}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Segmented control
 * ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex items-center gap-0.5 rounded-md border border-ink-border bg-paper-deep/60 p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-6 items-center gap-1.5 rounded-[4px] px-2.5 text-2xs font-medium transition-colors duration-150 ${
              active
                ? 'bg-paper-raised text-ink shadow-lift-1'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Progressive disclosure
 * ------------------------------------------------------------------ */

export function Disclosure({
  label,
  hint,
  children,
  defaultOpen = false,
  tone = 'neutral',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: 'neutral' | 'brand';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="border-t border-ink-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={`group flex w-full items-center gap-2 py-2.5 text-left transition-colors duration-150 ${
          tone === 'brand' ? 'text-brand-deep' : 'text-ink-muted'
        } hover:text-ink`}
      >
        <span
          aria-hidden="true"
          className={`text-[10px] transition-transform duration-200 ease-swift ${
            open ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
        <span className="text-2xs font-semibold uppercase tracking-[0.12em]">{label}</span>
        {hint ? <span className="ml-auto text-2xs text-ink-soft">{hint}</span> : null}
      </button>
      {open ? (
        <div id={id} className="animate-fade-rise pb-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Small form primitives
 * ------------------------------------------------------------------ */

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  label,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  id?: string;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={fieldId} className="eyebrow block">
          {label}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded border border-ink-border bg-paper-raised px-2.5 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-soft/80 focus:border-brand focus:outline-none"
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1.5">
      <span
        className={`relative mt-[3px] h-4 w-7 shrink-0 rounded-full border transition-colors duration-200 ease-swift ${
          checked ? 'border-brand bg-brand' : 'border-ink-border bg-ink/[0.06]'
        }`}
      >
        <span
          className={`absolute top-[1px] h-3 w-3 rounded-full bg-paper-raised shadow-lift-1 transition-transform duration-200 ease-swift ${
            checked ? 'translate-x-[13px]' : 'translate-x-[1px]'
          }`}
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm leading-5 text-ink">{label}</span>
        {description ? (
          <span className="block text-xs leading-5 text-ink-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Definition row — used for metadata tables
 * ------------------------------------------------------------------ */

export function MetaRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 py-[5px]">
      <dt className="w-[38%] shrink-0 text-2xs uppercase tracking-[0.1em] text-ink-soft">
        {label}
      </dt>
      <dd className={`min-w-0 flex-1 text-xs leading-5 text-ink ${mono ? 'font-mono' : ''}`}>
        {children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sheet — a bottom sheet for the mobile companion experience
 * ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-ink/35 backdrop-blur-[2px]"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-fade-rise overflow-y-auto rounded-t-2xl border-t border-ink-border bg-paper-raised shadow-lift-3">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-ink-border bg-paper-raised/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-ink-border" />
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xs font-medium text-ink-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 border-t border-ink-border bg-paper-raised/95 px-4 py-3 backdrop-blur">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Empty state
 * ------------------------------------------------------------------ */

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-ink-border px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-ink-soft">{icon}</div> : null}
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      {children ? (
        <p className="mt-1.5 max-w-[46ch] text-sm leading-6 text-ink-muted">{children}</p>
      ) : null}
    </div>
  );
}
