import { Link, type LinkProps } from "react-router-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./Button";

/**
 * 长得像按钮的导航：一个 <a>，不是 <a><button>。
 * 交互元素不能互相嵌套（HTML 内容模型；读屏会读成两个控件，Tab 要停两次）。
 */
export function ButtonLink({
	variant = "primary",
	size = "md",
	className,
	...props
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
	return <Link className={buttonClass({ variant, size, className })} {...props} />;
}
