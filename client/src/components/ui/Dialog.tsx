import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * A modal built on the native `<dialog>` element.
 *
 * The platform element gives focus trapping, inertness of the background, Esc
 * handling and the top layer for free — all of which are easy to implement
 * badly by hand, and all of which matter for keyboard and screen-reader users.
 */
export const Dialog = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // Esc fires `cancel`; route it through our handler so parent state stays in
    // sync with what the browser just did.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={cn(
        'w-[min(32rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-0',
        'surface-raised text-primary backdrop:bg-slate-900/50 backdrop:backdrop-blur-sm',
        'open:animate-fade-rise m-auto',
        className,
      )}
      // Clicking the backdrop (the dialog element itself, outside its content)
      // dismisses, matching what users expect from a modal.
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
        <div>
          <h2 id="dialog-title" className="text-base font-semibold text-primary">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-secondary">{description}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex justify-end gap-3 border-t border-[var(--border-subtle)] px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
};

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isPending?: boolean;
  destructive?: boolean;
}

export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  isPending,
  destructive = true,
}: ConfirmDialogProps) => (
  <Dialog
    open={open}
    onClose={onClose}
    title={title}
    className="w-[min(26rem,calc(100vw-2rem))]"
    footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          onClick={onConfirm}
          isLoading={isPending}
          loadingText="Working…"
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p className="text-sm text-secondary">{description}</p>
  </Dialog>
);
