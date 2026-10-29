import { CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";

export type AlertType = "success" | "error" | "warning";

export interface AlertState {
	show: boolean;
	type: AlertType;
	title: string;
	message: string;
	details?: string;
}

const TONE: Record<AlertType, string> = {
	success: "text-success-fg",
	error: "text-error-fg",
	warning: "text-warning-fg",
};

/** 保存 / 测试连接的结果弹窗 */
export function SettingsAlert({
	alert,
	onDismiss,
	onConfirm,
}: {
	alert: AlertState;
	onDismiss: () => void;
	onConfirm: () => void;
}) {
	const Icon = alert.type === "success" ? CheckCircleIcon : ExclamationCircleIcon;
	return (
		<Dialog open={alert.show} onClose={onDismiss} labelledBy="settings-alert-title" className="max-w-md p-4">
			<div className="flex items-start gap-2.5">
				<div className={`shrink-0 ${TONE[alert.type]}`}>
					<Icon className="h-6 w-6" />
				</div>
				<div className="min-w-0 flex-1">
					<h3 id="settings-alert-title" className="mb-1 text-md font-bold">
						{alert.title}
					</h3>
					<p className="m-0 text-sm text-ink/80">{alert.message}</p>
					{alert.details && (
						<div className="mt-2 rounded-md border border-ink/15 bg-paper-200 p-2">
							<p className="m-0 whitespace-pre-line text-xs">{alert.details}</p>
						</div>
					)}
				</div>
			</div>
			<div className="dialog-actions">
				<Button variant="primary" size="sm" onClick={onConfirm}>
					确定
				</Button>
			</div>
		</Dialog>
	);
}
