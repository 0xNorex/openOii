import { useRef, type ReactNode } from "react";
import { Button } from "./Button";
import { useDialogFocus } from "./useDialogFocus";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useDialogFocus(modalRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="dialog-panel w-full max-w-lg p-4"
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <h3
            id="modal-title"
            className="mb-2 font-heading text-md font-bold"
          >
            {title}
          </h3>
        )}
        <div className="py-2 text-base">{children}</div>
        <div className="dialog-actions">
          {actions}
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
