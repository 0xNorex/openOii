import { create } from "zustand";
import { devtools } from "zustand/middleware";

// 生产环境 devtools 本就是直通（enabled: DEV）；这里在构建期直接去掉它，让 tree-shaking 删掉整段中间件代码
const withDevtools = (import.meta.env.DEV ? devtools : (fn: unknown) => fn) as typeof devtools;

export type RunMode = "manual" | "yolo";

/**
 * Client-owned workbench state only.
 *
 * Everything the server owns (project fields, characters, shots, the chat
 * feed and the live run UI) lives in the TanStack Query cache — see
 * `~/query` (ADR 0007). This store keeps selection, the highlighted message
 * and the manual/yolo run-mode preference.
 */
interface EditorState {
	selectedShotId: number | null;
	selectedCharacterId: number | null;
	highlightedMessageIndex: number | null;
	runMode: RunMode;

	setSelectedShot: (id: number | null) => void;
	setSelectedCharacter: (id: number | null) => void;
	setHighlightedMessage: (index: number | null) => void;
	setRunMode: (mode: RunMode) => void;
	reset: () => void;
}

const initialState = {
	selectedShotId: null,
	selectedCharacterId: null,
	highlightedMessageIndex: null,
	runMode: "manual" as RunMode,
};

export const useEditorStore = create<EditorState>()(
	withDevtools(
		(set) => ({
			...initialState,

			setSelectedShot: (id) =>
				set({ selectedShotId: id }, false, "setSelectedShot"),
			setSelectedCharacter: (id) =>
				set({ selectedCharacterId: id }, false, "setSelectedCharacter"),
			setHighlightedMessage: (index) =>
				set({ highlightedMessageIndex: index }, false, "setHighlightedMessage"),
			setRunMode: (mode) => set({ runMode: mode }, false, "setRunMode"),
			reset: () => set(initialState, false, "reset"),
		}),
		{ name: "EditorStore", enabled: import.meta.env.DEV },
	),
);
