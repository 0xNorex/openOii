import { useCallback, useState, type ReactNode } from "react";
import {
	ArchiveBoxIcon,
	ArrowsPointingOutIcon,
	CursorArrowRaysIcon,
	HandRaisedIcon,
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
	Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { projectsApi } from "~/services/api";
import { toast } from "~/utils/toast";
import { Button } from "~/components/ui/Button";

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

	return (
		<div
			// <lg 不渲染：画布本身在移动端不挂载，工具条不能悬浮压住抽屉/聊天
			className="absolute bottom-[6.75rem] left-1/2 z-panel hidden -translate-x-1/2 items-center justify-center gap-0.5 rounded-lg border-2 border-ink/15 bg-paper-100 p-1 text-ink shadow-panel lg:flex"
			role="toolbar"
			aria-label="画布工具栏"
		>
			<ToolButton
				active={controls.tool === "select"}
				label="选择工具"
				onClick={() => controls.setTool("select")}
			>
				<CursorArrowRaysIcon className="h-4 w-4" />
			</ToolButton>
			<ToolButton
				active={controls.tool === "hand"}
				label="抓手工具"
				onClick={() => controls.setTool("hand")}
			>
				<HandRaisedIcon className="h-4 w-4" />
			</ToolButton>

			<Divider />

			<ToolButton label="缩小" onClick={controls.zoomOut}>
				<MagnifyingGlassMinusIcon className="h-4 w-4" />
			</ToolButton>
			<Button
				variant="ghost"
				size="sm"
				className="touch-target-dense h-8 min-h-8 min-w-[3.25rem] font-mono text-xs"
				onClick={controls.zoomReset}
				aria-label={`${controls.zoomPercent}%，重置缩放`}
				title="重置缩放"
			>
				{controls.zoomPercent}%
			</Button>
			<ToolButton label="放大" onClick={controls.zoomIn}>
				<MagnifyingGlassPlusIcon className="h-4 w-4" />
			</ToolButton>
			<ToolButton label="适应视图" onClick={controls.fit}>
				<ArrowsPointingOutIcon className="h-4 w-4" />
			</ToolButton>

			<Divider />

			<ToolButton label="整理画布" showLabel labelText="整理" onClick={onResetLayout}>
				<Squares2X2Icon className="h-4 w-4" />
			</ToolButton>
			{onToggleSortMode ? (
				<ToolButton
					active={sortMode}
					disabled={sortDisabled}
					label={sortMode ? "完成分镜排序" : "排序九宫格"}
					showLabel
					labelText={sortMode ? "完成排序" : "排序"}
					onClick={onToggleSortMode}
				>
					<span className="font-mono text-xs font-bold">3×N</span>
				</ToolButton>
			) : null}
			<ToolButton
				disabled={fillDisabled || filling}
				label="补齐空格 · 首帧"
				showLabel
				labelText={filling ? "补齐中" : "补首帧"}
				onClick={() => handleFillEmpty("image")}
			>
				<span className="font-mono text-xs font-bold">图</span>
			</ToolButton>
			<ToolButton
				disabled={fillDisabled || filling}
				label="补齐空格 · 视频"
				showLabel
				labelText={filling ? "补齐中" : "补视频"}
				onClick={() => handleFillEmpty("video")}
			>
				<span className="font-mono text-xs font-bold">视</span>
			</ToolButton>
			{onOpenAssets ? (
				<>
					<Divider />
					<ToolButton label="打开资产库" showLabel labelText="资产" onClick={onOpenAssets}>
						<ArchiveBoxIcon className="h-4 w-4" />
					</ToolButton>
				</>
			) : null}

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
	onClick,
	showLabel,
	children,
}: {
	active?: boolean;
	disabled?: boolean;
	label: string;
	labelText?: string;
	onClick: () => void;
	showLabel?: boolean;
	children: ReactNode;
}) {
	return (
		<Button
			variant={active ? "primary" : "ghost"}
			size="sm"
			className={`touch-target-dense h-8 min-h-8 ${showLabel ? "min-w-8 gap-1 px-2" : "w-8 px-0"}`}
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			title={label}
		>
				{children}
				{showLabel ? (
					<span className="hidden whitespace-nowrap text-xs font-semibold min-[1400px]:inline">
						{labelText ?? label}
					</span>
				) : null}
		</Button>
	);
}
