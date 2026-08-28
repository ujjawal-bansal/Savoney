import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

const fieldStyles =
  'w-full rounded-lg border border-[var(--border-subtle)] surface px-3 py-2 text-sm text-primary ' +
  'placeholder:text-[var(--text-muted)] transition-colors ' +
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-[var(--color-negative)] aria-[invalid=true]:ring-[var(--color-negative)]/20';

interface FieldWrapperProps {
  label?: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}

/**
 * Wires a label, hint and error message to a control with the ARIA attributes
 * that make the association real. A visual-only error message is invisible to a
 * screen reader, which is exactly when the user most needs to hear it.
 */
export const Field = ({ label, error, hint, required, children }: FieldWrapperProps) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-secondary">
          {label}
          {required && (
            <span className="text-[var(--color-negative)]" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        // `role="alert"` makes the message announced the moment it appears.
        <p id={errorId} role="alert" className="text-xs font-medium text-[var(--color-negative)]">
          {error}
        </p>
      )}
    </div>
  );
};

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldStyles, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldStyles, 'resize-y min-h-20', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldStyles, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
