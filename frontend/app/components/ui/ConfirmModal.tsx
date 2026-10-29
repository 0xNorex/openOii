import { useId, useRef } from "react";
import { Dialog } from "./Dialog";
import { SvgIcon } from "~/components/ui/SvgIcon";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "确认操作",
  message,
  confirmText = "确认",
  cancelText = "取消",
  variant = "danger",
  isLoading = false,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const variantStyles = {
    danger: {
      icon: "text-error-fg",
      iconBg: "bg-error/10",
      button: "bg-error text-error-content",
    },
    warning: {
      icon: "text-warning-fg",
      iconBg: "bg-warning/10",
      button: "bg-warning text-warning-content",
    },
    info: {
      icon: "text-info-fg",
      iconBg: "bg-info/10",
      button: "bg-info text-info-content",
    },
  };

  const styles = variantStyles[variant];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      dismissible={!isLoading}
      labelledBy={titleId}
      initialFocusRef={cancelRef}
      className="w-full max-w-md p-4"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${styles.iconBg}`}
        >
          <SvgIcon name="triangle-alert" size={20} className={`${styles.icon}`} />
        </div>

        <div className="min-w-0 flex-1">
          <h3
            id={titleId}
            className="m-0 text-md font-bold"
          >
            {title}
          </h3>
          <p className="m-0 mt-1 text-sm text-ink-muted">{message}</p>
        </div>
      </div>

      <div className="dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn-doodle bg-transparent border-transparent shadow-none hover:bg-paper-200 h-9 min-h-9 border border-line-strong px-3 text-sm"
          onClick={onClose}
          disabled={isLoading}
        >
          {cancelText}
        </button>
        <button
          type="button"
          className={`btn-doodle ${styles.button} h-9 min-h-9 border border-line-strong px-3 text-sm`}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading && <span className="spinner-doodle h-4 w-4" />}
          {confirmText}
        </button>
      </div>
    </Dialog>
  );
}
