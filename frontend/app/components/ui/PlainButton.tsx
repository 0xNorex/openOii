import { forwardRef, type ButtonHTMLAttributes } from "react";

/**
 * 不像按钮的可点击元素（标签页、菜单项、可选卡片、列表行、图片缩略图）。
 * 无预设样式，只保证 type="button"。普通按钮用 Button / IconButton。
 */
export const PlainButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function PlainButton({ type = "button", ...props }, ref) {
    return <button ref={ref} type={type} {...props} />;
  },
);
