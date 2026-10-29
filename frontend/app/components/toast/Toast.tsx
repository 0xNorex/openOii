import { useEffect } from "react";
import { useToastStore } from "~/stores/toast.store";
import type { Toast as ToastType } from "~/types/errors";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { SvgIcon } from "~/components/ui/SvgIcon";

interface ToastProps {
  toast: ToastType;
}

export function Toast({ toast }: ToastProps) {
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, removeToast]);

  const typeStyles = {
    success: "border-success",
    error: "border-error",
    warning: "border-warning",
    info: "border-info",
  };

  return (
    <div
      className={`
        relative min-w-64 max-w-[22rem] rounded-lg border bg-paper-100 p-3
        shadow-panel ${typeStyles[toast.type]}
        animate-slide-in-right
      `}
      role="status"
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h4 className="m-0 text-sm font-bold leading-snug">
          {toast.title}
        </h4>
        <IconButton
          onClick={() => removeToast(toast.id)}
          className="rounded-full"
          aria-label="关闭"
        >
          <SvgIcon name="x" size={14} />
        </IconButton>
      </div>

      <p className="m-0 text-xs leading-snug text-ink-muted">
        {toast.message}
      </p>

      {toast.actions && toast.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {toast.actions.map((action, index) => (
            <Button size="sm" variant={action.variant === "primary" ? "primary" : "ghost"}
              key={index}
              onClick={() => {
                action.onClick();
                removeToast(toast.id);
              }}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
