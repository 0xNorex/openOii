import { useCallback, useState, type ReactNode } from "react";
import { projectsApi } from "~/services/api";
import { toast } from "~/utils/toast";
import { Button } from "~/components/ui/Button";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { MenuButton, MenuItem } from "~/components/ui/Menu";
import "~/components/ui/icons/workbenchIcons";

interface ComicCanvasToolbarProps {
	projectId: number;
	onResetLayout: () => void;
	sortMode?: boolean;
	sortDisabled?: boolean;
	onToggleSortMode?: () => void;
	fillDisabled?: boolean;
	/** Opens the asset library drawer. */
	onOpenAssets?: () => void;
}

/** 视图控制由画布实现（React Flow）。 */
export interface CanvasViewControls {
	tool: "select" | "hand";
	setTool: (tool: "select" | "hand") => void;
	zoomPercent: number;
	zoomIn: () => void;
	zoomOut: () => void;
	zoomReset: () => void;
	fit: () => void;
}

export function ComicCanvasToolbar({
	projectId,
	onResetLayout,
	sortMode = false,
	sortDisabled = false,
	onToggleSortMode,
	fillDisabled = false,
	onOpenAssets,
	controls,
}: ComicCanvasToolbarProps & { controls: CanvasViewControls }) {
	const [filling, setFilling] = useState(false);

	const handleFillEmpty = useCallback(
		async (type: "image" | "video") => {
			if (fillDisabled || filling) return;
			setFilling(true);
			try {
				await projectsApi.fillEmptyShots(projectId, type);
				toast.success({
					title: type === "image" ? "补齐空格 · 首帧" : "补齐空格 · 视频",
					message: "已启动，仅生成缺少产物的分镜格",
				});
			} catch (error) {
				toast.error({
					title: "补齐失败",
					message: error instanceof Error ? error.message : "请稍后重试",
				});
			} finally {
				setFilling(false);
			}
		},
		[fillDisabled, filling, projectId],
	);

	const fillBusy = fillDisabled || filling;

	return (
		<div
			// <lg 不渲染：画布本身在移动端不挂载，工具条不能悬浮压住抽屉/聊天
			className="absolute bottom-toolbar left-1/2 z-panel hidden -translate-x-1/2 items-center justify-center gap-0.5 rounded-lg border border-line bg-paper-100 p-1 text-ink shadow-panel lg:flex"
			role="toolbar"
			aria-label="画布工具栏"
		>
			{/* 视图：工具 + 缩放，全是图标 */}
			<ToolButton active={controls.tool === "select"} label="选择工具" shortcut="V" onClick={() => controls.setTool("select")}>
				<SvgIcon name="cursor" size={16} />
			</ToolButton>
			<ToolButton active={controls.tool === "hand"} label="抓手工具" shortcut="H" onClick={() => controls.setTool("hand")}>
				<SvgIcon name="hand" size={16} />
			</ToolButton>

			<Divider />

			<ToolButton label="缩小" onClick={controls.zoomOut}>
				<SvgIcon name="zoom-out" size={16} />
			</ToolButton>
			<Button
				variant="ghost"
				size="sm"
				className="touch-target-dense h-8 min-h-8 min-w-[3.25rem] px-1 font-mono text-xs tabular-nums"
				onClick={controls.zoomReset}
				aria-label={`${controls.zoomPercent}%，重置缩放`}
				title="重置缩放"
			>
				{controls.zoomPercent}%
			</Button>
			<ToolButton label="放大" onClick={controls.zoomIn}>
				<SvgIcon name="zoom-in" size={16} />
			</ToolButton>
			<ToolButton label="适应视图" onClick={controls.fit}>
				<SvgIcon name="expand" size={16} />
			</ToolButton>

			<Divider />

			{/* 画布动作：常用的两个带文字，少用的收进「更多」 */}
			{sortMode && onToggleSortMode ? (
				// 排序是一个模式：进入后「完成排序」必须一直看得见
				<ToolButton active label="完成分镜排序" labelText="完成排序" onClick={onToggleSortMode}>
					<SvgIcon name="check" size={16} />
				</ToolButton>
			) : (
				<ToolButton label="整理画布" labelText="整理" onClick={onResetLayout}>
					<SvgIcon name="view-grid" size={16} />
				</ToolButton>
			)}
			{onOpenAssets ? (
				<ToolButton label="打开资产库" labelText="资产" onClick={onOpenAssets}>
					<SvgIcon name="archive" size={16} />
				</ToolButton>
			) : null}
			<MenuButton label="更多画布操作" menuLabel="更多画布操作" placement="top" width="w-48">
				{onToggleSortMode && !sortMode ? (
					<MenuItem icon="layers" onClick={onToggleSortMode} disabled={sortDisabled} aria-label="排序九宫格">
						排序分镜
					</MenuItem>
				) : null}
				<MenuItem icon="image" onClick={() => void handleFillEmpty("image")} disabled={fillBusy} aria-label="补齐空格 · 首帧">
					{filling ? "补齐中…" : "补齐缺失首帧"}
				</MenuItem>
				<MenuItem icon="video-camera" onClick={() => void handleFillEmpty("video")} disabled={fillBusy} aria-label="补齐空格 · 视频">
					{filling ? "补齐中…" : "补齐缺失视频"}
				</MenuItem>
			</MenuButton>
		</div>
	);
}

function Divider() {
	return <div className="mx-0.5 h-5 w-px bg-ink/15" />;
}

function ToolButton({
	active,
	disabled,
	label,
	labelText,
	shortcut,
	onClick,
	children,
}: {
	active?: boolean;
	disabled?: boolean;
	label: string;
	/** 有文字的按钮永远显示文字；纯图标按钮靠 aria-label + title */
	labelText?: string;
	shortcut?: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button
			variant={active ? "primary" : "ghost"}
			size="sm"
			className={`touch-target-dense h-8 min-h-8 ${labelText ? "gap-1.5 px-2" : "w-8 px-0"}`}
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			aria-pressed={active === undefined ? undefined : active}
			aria-keyshortcuts={shortcut}
			title={shortcut ? `${label}（${shortcut}）` : label}
		>
			{children}
			{labelText ? <span className="whitespace-nowrap text-xs font-semibold">{labelText}</span> : null}
		</Button>
	);
}
