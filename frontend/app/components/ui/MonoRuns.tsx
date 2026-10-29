/** 汉字与全角标点 */
const CJK_RUN = /([\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+)/;

/**
 * 运行时混排文本：只有数字/拉丁片段走 font-mono，汉字留在外层无衬线里。
 * 例：「3 章节 · 2 角色」→ <mono>3 </mono>章节<mono> · 2 </mono>角色
 */
export function MonoRuns({ text }: { text: string }) {
	return (
		<>
			{text.split(CJK_RUN).map((part, i) =>
				!part ? null : i % 2 ? (
					part
				) : (
					<span key={i} className="font-mono">
						{part}
					</span>
				),
			)}
		</>
	);
}
