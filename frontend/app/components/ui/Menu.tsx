import { clsx } from "clsx";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
	type AnchorHTMLAttributes,
	type ButtonHTMLAttributes,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { IconButton } from "./IconButton";
import { PlainButton } from "./PlainButton";
import { SvgIcon, type IconName } from "./SvgIcon";

/**
 * 唯一的「···」溢出菜单：顶栏工作台工具、画布工具条共用。
 * 点开聚焦第一项，↑↓ / Home / End 移动，Esc 或点外面收起并把焦点还给按钮，选中一项后自动收起。
 */
const MenuClose = createContext<() => void>(() => {});

const ITEM = "flex w-full touch-target-dense items-center gap-2 rounded-md px-2 text-left text-xs text-ink hover:bg-paper-200 focus-visible:bg-paper-200 disabled:cursor-not-allowed disabled:opacity-50";

function items(root: HTMLElement | null): HTMLElement[] {
	return root ? Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')) : [];
}

export function MenuButton({
	label,
	menuLabel,
	title,
	icon = "more-horiz",
	placement = "bottom",
	align = "end",
	width = "w-44",
	children,
}: {
	/** 触发按钮的可读名称 */
	label: string;
	menuLabel: string;
	title?: string;
	icon?: IconName;
	/** 工具条在底部时向上展开 */
	placement?: "top" | "bottom";
	align?: "start" | "end";
	width?: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const id = useId();

	const close = useCallback((refocus = true) => {
		setOpen(false);
		if (refocus) triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!open) return;
		items(listRef.current)[0]?.focus();
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) close(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, close]);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!open) return;
		if (event.key === "Escape") {
			event.stopPropagation();
			close();
			return;
		}
		const list = items(listRef.current);
		if (list.length === 0) return;
		const index = list.indexOf(document.activeElement as HTMLElement);
		const next =
			event.key === "ArrowDown" ? (index + 1) % list.length
			: event.key === "ArrowUp" ? (index - 1 + list.length) % list.length
			: event.key === "Home" ? 0
			: event.key === "End" ? list.length - 1
			: null;
		if (next === null) return;
		event.preventDefault();
		list[next].focus();
	};

	return (
		<div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
			<IconButton
				ref={triggerRef}
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				title={title ?? label}
				onClick={() => setOpen((value) => !value)}
			>
				<SvgIcon name={icon} size={16} />
			</IconButton>
			{open ? (
				<MenuClose.Provider value={() => close()}>
					<ul
						id={id}
						ref={listRef}
						role="menu"
						aria-label={menuLabel}
						className={clsx(
							"animate-enter absolute z-popover list-none rounded-md border border-line bg-surface p-1 shadow-panel",
							width,
							placement === "top" ? "bottom-full mb-1" : "top-full mt-1",
							align === "end" ? "right-0" : "left-0",
						)}
					>
						{children}
					</ul>
				</MenuClose.Provider>
			) : null}
		</div>
	);
}

export function MenuItem({
	icon,
	children,
	onClick,
	className,
	...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> & { icon?: IconName }) {
	const close = useContext(MenuClose);
	return (
		<li role="none">
			<PlainButton
				role="menuitem"
				className={clsx(ITEM, className)}
				onClick={(event) => {
					close();
					onClick?.(event);
				}}
				{...props}
			>
				{icon ? <SvgIcon name={icon} size={14} /> : null}
				{children}
			</PlainButton>
		</li>
	);
}

export function MenuLink({
	icon,
	children,
	onClick,
	className,
	...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "role"> & { icon?: IconName }) {
	const close = useContext(MenuClose);
	return (
		<li role="none">
			<a
				role="menuitem"
				className={clsx(ITEM, className)}
				onClick={(event) => {
					close();
					onClick?.(event);
				}}
				{...props}
			>
				{icon ? <SvgIcon name={icon} size={14} /> : null}
				{children}
			</a>
		</li>
	);
}

export function MenuSeparator() {
	return <li role="separator" className="my-1 h-px bg-line" />;
}
