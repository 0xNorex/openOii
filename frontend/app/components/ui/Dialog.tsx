import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

type DialogVariant = "center" | "sheet-right" | "sheet-bottom" | "lightbox";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** id of the element that names the dialog */
  labelledBy?: string;
  /** accessible name when there is no visible title */
  label?: string;
  variant?: DialogVariant;
  /** classes for the content panel (size, padding, layout) */
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** false blocks Escape and backdrop dismissal (e.g. while saving) */
  dismissible?: boolean;
  /** false keeps the dialog open on a backdrop click (forms with edits) */
  closeOnBackdrop?: boolean;
}

const variantClass: Record<DialogVariant, string> = {
  center: "dialog-center",
  "sheet-right": "dialog-sheet-right",
  "sheet-bottom": "dialog-sheet-bottom",
  lightbox: "dialog-lightbox",
};

/**
 * The one modal primitive: a native <dialog> opened with showModal(), so it
 * renders in the browser top layer above every z-index, traps focus and
 * makes the rest of the page inert without any JS bookkeeping.
 */
export function Dialog({
  open,
  onClose,
  children,
  labelledBy,
  label,
  variant = "center",
  className = "",
  initialFocusRef,
  dismissible = true,
  closeOnBackdrop = true,
}: DialogProps) {
  if (!open) return null;
  return (
    <OpenDialog
      onClose={onClose}
      labelledBy={labelledBy}
      label={label}
      variant={variant}
      className={className}
      initialFocusRef={initialFocusRef}
      dismissible={dismissible}
      closeOnBackdrop={closeOnBackdrop}
    >
      {children}
    </OpenDialog>
  );
}

function OpenDialog({
  onClose,
  children,
  labelledBy,
  label,
  variant,
  className,
  initialFocusRef,
  dismissible,
  closeOnBackdrop,
}: Omit<DialogProps, "open"> & { variant: DialogVariant }) {
  const ref = useRef<HTMLDialogElement>(null);
  const latest = useRef({ onClose, dismissible, closeOnBackdrop, unmounting: false });
  latest.current = { onClose, dismissible, closeOnBackdrop, unmounting: latest.current.unmounting };

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      latest.current.unmounting = true;
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    initialFocusRef?.current?.focus();
  }, [initialFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={label}
      className={`dialog ${variantClass[variant]}`}
      onCancel={(event) => {
        event.preventDefault();
        if (latest.current.dismissible) latest.current.onClose();
      }}
      onClose={() => {
        // The browser may force-close (e.g. repeated Escape); keep React in sync.
        if (!latest.current.unmounting) latest.current.onClose();
      }}
      onClick={(event) => {
        if (
          event.target === event.currentTarget &&
          latest.current.dismissible &&
          latest.current.closeOnBackdrop
        ) {
          latest.current.onClose();
        }
      }}
    >
      <div className={`dialog-panel ${className}`}>{children}</div>
    </dialog>
  );
}
