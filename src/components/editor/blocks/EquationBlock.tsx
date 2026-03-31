/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import "katex/dist/katex.min.css";

import { useRef, useState } from "react";
import katex from "katex";
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react";
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext";
import { EQUATION_BLOCK_TYPE, getEquationBlockPropsFromElement } from "@/lib/editor-paste";
import { normalizeLatexSource } from "@/lib/latex";

export const equationBlockSpec = createReactBlockSpec(
	{
		type: "equation",
		propSchema: {
			latex: { default: "\\int_0^1 x^2 dx" },
			displayMode: { default: true, type: "boolean" as const },
		},
		content: "none",
	},
	{
		parse: (element) => getEquationBlockPropsFromElement(element),
		render: (props) => {
			const [isEditing, setIsEditing] = useState(false);
			const [draft, setDraft] = useState(props.block.props.latex);
			const [error, setError] = useState<string | null>(null);
			const wrapperRef = useRef<HTMLDivElement>(null);
			const isPreview = usePreviewMode();

			const renderLatex = (source: string) => {
				try {
					const html = katex.renderToString(normalizeLatexSource(source) || "\\,", {
						throwOnError: true,
						displayMode: props.block.props.displayMode,
					});
					return { html, error: null as string | null };
				} catch {
					return { html: source, error: "Invalid LaTeX - check your syntax" };
				}
			};

			const preview = renderLatex(draft);
			const persisted = renderLatex(props.block.props.latex);
			const equationTextAlign = props.block.props.displayMode ? "center" : "left";

			const renderEquationHtml = (html: string) => (
				<div className="overflow-x-auto max-w-[calc(100vw-1.5rem)] md:max-w-none" style={{ color: "var(--text-primary)" }}>
					<div className={props.block.props.displayMode ? "mx-auto w-max" : "w-max"}>
						<div
							className="katex-wrapper"
							style={{ textAlign: equationTextAlign, color: "var(--text-primary)" }}
							dangerouslySetInnerHTML={{ __html: html }}
						/>
					</div>
				</div>
			);

			if (isPreview) {
				return (
					<BlockContentWrapper
						blockType={props.block.type}
						blockProps={props.block.props}
						propSchema={props.editor.schema.blockSchema.equation.propSchema}>
						<div
							className="w-full max-w-[65vw] rounded-[var(--sn-radius-lg)] border p-3 md:max-w-full"
							style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
							{persisted.error ? (
								<pre className="whitespace-pre-wrap text-xs" style={{ color: "#fca5a5", fontFamily: "var(--font-mono)" }}>
									{props.block.props.latex}
								</pre>
							) : (
								renderEquationHtml(persisted.html)
							)}
						</div>
					</BlockContentWrapper>
				);
			}

			const commit = () => {
				const next = draft.trim() || "\\,";
				props.editor.updateBlock(props.block, {
					type: "equation",
					props: {
						...props.block.props,
						latex: next,
					},
				});
				setError(preview.error);
				setIsEditing(false);
			};

			return (
				<BlockContentWrapper
					blockType={props.block.type}
					blockProps={props.block.props}
					propSchema={props.editor.schema.blockSchema.equation.propSchema}>
					<div
						ref={wrapperRef}
						className="w-full max-w-[65vw] rounded-[var(--sn-radius-lg)] border p-3 md:max-w-full"
						style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
						{isEditing ? (
							<div>
								<textarea
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											setDraft(props.block.props.latex);
											setIsEditing(false);
										}
									}}
									onBlur={commit}
									autoFocus
									className="mb-3 min-h-[72px] w-full resize-y rounded-[var(--sn-radius-sm)] border px-3 py-2 text-sm outline-none"
									style={{
										borderColor: "var(--border-strong)",
										backgroundColor: "#0a0a0a",
										color: "var(--text-primary)",
										fontFamily: "var(--font-mono)",
									}}
								/>

								<div
									className="overflow-x-auto rounded-[var(--sn-radius-sm)] border px-2 py-3"
									style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}>
									{preview.error ? (
										<pre className="whitespace-pre-wrap text-xs" style={{ color: "#fca5a5", fontFamily: "var(--font-mono)" }}>
											{draft}
										</pre>
									) : (
										renderEquationHtml(preview.html)
									)}
								</div>
								{preview.error && (
									<p className="mt-2 text-xs" style={{ color: "#f87171" }}>
										{preview.error}
									</p>
								)}
							</div>
						) : (
							<button
								type="button"
								className="min-w-0 w-full cursor-text text-left"
								onClick={() => {
									setDraft(props.block.props.latex);
									setIsEditing(true);
								}}>
								{persisted.error ? (
									<div>
										<pre className="whitespace-pre-wrap text-xs" style={{ color: "#fca5a5", fontFamily: "var(--font-mono)" }}>
											{props.block.props.latex}
										</pre>
										<p className="mt-2 text-xs" style={{ color: "#f87171" }}>
											Invalid LaTeX - check your syntax
										</p>
									</div>
								) : (
									renderEquationHtml(persisted.html)
								)}
							</button>
						)}
					</div>
					{error && !isEditing && (
						<p className="mt-1 text-xs" style={{ color: "#f87171" }}>
							{error}
						</p>
					)}
				</BlockContentWrapper>
			);
		},
		toExternalHTML: (props) => (
			<div
				data-content-type={EQUATION_BLOCK_TYPE}
				data-latex={props.block.props.latex}
				data-display-mode={props.block.props.displayMode ? "true" : "false"}>
				{props.block.props.displayMode ? `$$${props.block.props.latex}$$` : `\\(${props.block.props.latex}\\)`}
			</div>
		),
	},
);
