/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import "katex/dist/katex.min.css";

import { useMemo, useState } from "react";
import katex from "katex";
import { createReactInlineContentSpec, InlineContentWrapper } from "@blocknote/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getInlineEquationPropsFromElement, INLINE_EQUATION_TYPE } from "@/lib/editor-paste";
import { normalizeLatexSource } from "@/lib/latex";

const inlineEquationPropSchema = {
	latex: { default: "\\alpha" },
} as const;

function renderInlineLatex(source: string): { html: string; error: string | null } {
	try {
		return {
			html: katex.renderToString(normalizeLatexSource(source) || "\\,", {
				displayMode: false,
				throwOnError: true,
			}),
			error: null,
		};
	} catch {
		return {
			html: source,
			error: "Invalid LaTeX",
		};
	}
}

export const inlineEquationSpec = createReactInlineContentSpec(
	{
		type: INLINE_EQUATION_TYPE,
		propSchema: inlineEquationPropSchema,
		content: "none",
	},
	{
		parse: (element) => getInlineEquationPropsFromElement(element),
		render: (props) => {
			const [isEditorOpen, setIsEditorOpen] = useState(false);
			const [draft, setDraft] = useState(props.inlineContent.props.latex);
			const rendered = renderInlineLatex(props.inlineContent.props.latex);
			const preview = useMemo(() => renderInlineLatex(draft), [draft]);

			const openEditor = () => {
				if (!props.editor.isEditable) {
					return;
				}

				setDraft(props.inlineContent.props.latex);
				setIsEditorOpen(true);
			};

			const saveDraft = () => {
				const nextValue = draft.trim();
				if (!nextValue) {
					return;
				}

				props.updateInlineContent({
					type: INLINE_EQUATION_TYPE,
					props: {
						latex: nextValue,
					},
				});
				setIsEditorOpen(false);
			};

			return (
				<>
					<InlineContentWrapper
						inlineContentType={props.inlineContent.type}
						inlineContentProps={props.inlineContent.props}
						propSchema={inlineEquationPropSchema}>
						<span
							className="stacknote-inline-equation katex-wrapper"
							contentEditable={false}
							suppressContentEditableWarning
							title={props.editor.isEditable ? "Double-click to edit equation" : undefined}
							tabIndex={props.editor.isEditable ? 0 : -1}
							onDoubleClick={(event) => {
								event.preventDefault();
								event.stopPropagation();
								openEditor();
							}}
							onKeyDown={(event) => {
								if (!props.editor.isEditable) {
									return;
								}

								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									event.stopPropagation();
									openEditor();
								}
							}}
							style={{
								display: "inline-flex",
								alignItems: "center",
								minHeight: "1.75em",
								cursor: props.editor.isEditable ? "text" : "default",
							}}>
							{rendered.error ? (
								<code style={{ color: "#fca5a5", fontFamily: "var(--font-mono)", fontSize: "0.9em" }}>{props.inlineContent.props.latex}</code>
							) : (
								<span dangerouslySetInnerHTML={{ __html: rendered.html }} />
							)}
						</span>
					</InlineContentWrapper>

					<Dialog
						open={isEditorOpen}
						onOpenChange={(nextOpen) => {
							if (!nextOpen) {
								setIsEditorOpen(false);
							}
						}}>
						<DialogContent
							className="!top-1/2 !max-w-[560px] !-translate-y-1/2 rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[#0f1115] p-6 text-[#f5f7fb] shadow-[0_28px_80px_rgba(0,0,0,0.45)]"
							showCloseButton>
							<DialogHeader className="space-y-2">
								<DialogTitle className="text-lg text-[#f5f7fb]">Edit inline equation</DialogTitle>
								<DialogDescription className="text-[#8f97a8]">
									Update the LaTeX and review the result before saving it back into the note.
								</DialogDescription>
							</DialogHeader>

							<div className="space-y-4">
								<label className="block">
									<span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-[#8f97a8]">LaTeX</span>
									<textarea
										value={draft}
										onChange={(event) => setDraft(event.target.value)}
										autoFocus
										rows={3}
										className="min-h-[96px] w-full resize-y rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#090b10] px-4 py-3 text-sm text-[#f5f7fb] outline-none transition-colors focus:border-[rgba(124,106,255,0.72)]"
										style={{ fontFamily: "var(--font-mono)" }}
									/>
								</label>

								<div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-4">
									<p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-[#8f97a8]">Preview</p>
									<div className="min-h-[64px] rounded-[18px] border border-[rgba(255,255,255,0.06)] bg-[#11151d] px-4 py-4 text-[#f5f7fb]">
										{preview.error ? (
											<code style={{ color: "#fca5a5", fontFamily: "var(--font-mono)", fontSize: "0.9em" }}>{draft}</code>
										) : (
											<span className="katex-wrapper" dangerouslySetInnerHTML={{ __html: preview.html }} />
										)}
									</div>
									{preview.error ? <p className="mt-3 text-xs text-[#f87171]">{preview.error}</p> : null}
								</div>
							</div>

							<DialogFooter className="mt-2 border-t border-[rgba(255,255,255,0.08)] bg-transparent px-0 pb-0 pt-4">
								<Button
									type="button"
									variant="outline"
									onClick={() => setIsEditorOpen(false)}
									className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#c1c8d6] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#f5f7fb]">
									Cancel
								</Button>
								<Button
									type="button"
									onClick={saveDraft}
									disabled={!draft.trim()}
									className="bg-[#ece9ff] text-[#151326] hover:bg-[#f7f5ff] disabled:opacity-50">
									Save equation
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</>
			);
		},
		toExternalHTML: (props) => (
			<span data-inline-content-type={INLINE_EQUATION_TYPE} data-latex={props.inlineContent.props.latex}>
				{`\\(${props.inlineContent.props.latex}\\)`}
			</span>
		),
	},
);
