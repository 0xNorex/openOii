import { clsx } from "clsx";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "error";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  onClick,
  type = "button",
  ...props
}: ButtonProps) {
  const baseStyles =
    "btn-doodle font-semibold cursor-pointer inline-flex items-center justify-center";

  const variantStyles = {
    primary: "bg-primary text-primary-content hover:bg-primary/90",
    secondary: "bg-surface text-ink border-border-strong hover:bg-paper-200",
    ghost:
      "bg-transparent border-transparent shadow-none hover:bg-paper-200",
    error: "bg-error text-error-content hover:bg-error/90",
  };

  const sizeStyles = {
    // 不设 min-h-*：让 touch-target-dense 的 min-height 在触屏 (pointer:coarse)
    // 下升到 44px，也允许调用方用 min-h-[...] 覆盖
    sm: "h-8 touch-target-dense gap-1 px-2.5 py-1 text-sm",
    md: "h-9 touch-target-dense gap-1.5 px-3.5 py-1.5 text-base",
    lg: "h-11 touch-target gap-2 px-5 py-2 text-lg",
  };

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    await onClick?.(e);
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={clsx(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        isDisabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      disabled={isDisabled}
      onClick={handleClick}
      type={type}
      {...props}
    >
      {loading ? (
        <span className="spinner-doodle h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        children
      )}
    </button>
  );
}
