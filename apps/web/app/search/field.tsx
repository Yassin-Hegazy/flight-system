import type { ReactNode } from 'react';

export const INPUT_CLASS =
  'h-11 w-full rounded-field border border-input bg-white px-3 text-sm font-semibold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'aria-invalid:border-destructive';

export interface ControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}

/**
 * A label, its control, and the control's error right below it (NFR-USAB-01). The error and hint
 * are tied to the control with aria-describedby, so a screen reader reads them with the field.
 */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label htmlFor={id} className="text-[13px] font-semibold text-navy">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
