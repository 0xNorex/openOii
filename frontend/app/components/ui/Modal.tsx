import { useId, type ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  const titleId = useId();
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      labelledBy={title ? titleId : undefined}
      className="w-full max-w-lg p-4"
    >
      {title && (
        <h3 id={titleId} className="mb-2 text-md font-bold">
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
    </Dialog>
  );
}
