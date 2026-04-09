/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import { useState, useCallback } from "react";
import { Sparkles, Send, RotateCcw, Trash2, Plus, Loader2 } from "lucide-react";
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react";
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext";
import { AssistantContent } from "@/components/ai/AssistantContent";
import { AssistantResponseActions } from "@/components/ai/AssistantResponseActions";
import { readErrorMessage } from "@/lib/http";
import { notifyAiUsageChanged } from "@/lib/ai-usage-events";
import { stripAssistantReasoning } from "@/lib/ai-response";
import { DEFAULT_TEXT_MODEL } from "@/lib/groq-models";
import { parseRichTextToBlocks } from "@/lib/editor-paste";

export const aiBlockSpec = createReactBlockSpec(
	{
		type: "aiBlock",
		propSchema: {
			prompt: { default: "" },
			response: { default: "" },
			workspaceId: { default: "" },
			sessionId: { default: "" },
			noteId: { default: "" },
			model: { default: DEFAULT_TEXT_MODEL },
			status: { default: "idle" }, // "idle" | "generating" | "done" | "error"
			error: { default: "" },
		},
		content: "none",
	},
	{
		render: (props) => {
			const [localPrompt, setLocalPrompt] = useState(props.block.props.prompt);
			const [isGenerating, setIsGenerating] = useState(false);
			const isPreview = usePreviewMode();
			const status = props.block.props.status as "idle" | "generating" | "done" | "error";
			const workspaceId = typeof props.block.props.workspaceId === "string" ? props.block.props.workspaceId.trim() : "";
			const sessionId = typeof props.block.props.sessionId === "string" ? props.block.props.sessionId.trim() : "";
			const noteId = typeof props.block.props.noteId === "string" ? props.block.props.noteId.trim() : "";

			const ensureSession = useCallback(async () => {
				if (sessionId) {
					return sessionId;
				}

				const response = await fetch("/api/ai/sessions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						workspaceId: workspaceId || undefined,
						noteId: noteId || undefined,
						title: localPrompt.trim() || undefined,
					}),
				});

				if (!response.ok) {
					throw new Error(await readErrorMessage(response, "Failed to create chat session"));
				}

				const data = await response.json();
				const createdSessionId = typeof data?.session?.id === "string" ? data.session.id.trim() : "";
				if (!createdSessionId) {
					throw new Error("Failed to create chat session");
				}

				props.editor.updateBlock(props.block, {
					type: "aiBlock",
					props: {
						...props.block.props,
						sessionId: createdSessionId,
					},
				});

				return createdSessionId;
			}, [localPrompt, noteId, props, sessionId, workspaceId]);

			const handleSubmit = useCallback(
				async (promptOverride?: string) => {
					const prompt = (promptOverride ?? localPrompt).trim();
					if (!prompt || isGenerating) return;

					setIsGenerating(true);
					props.editor.updateBlock(props.block, {
						type: "aiBlock",
						props: {
							...props.block.props,
							prompt,
							status: "generating",
							error: "",
							response: "",
						},
					});

					try {
						const activeSessionId = await ensureSession();
						const response = await fetch("/api/ai/chat", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								message: prompt,
								sessionId: activeSessionId,
								noteId: noteId || undefined,
								noteContent: props.editor.document,
								model: props.block.props.model || DEFAULT_TEXT_MODEL,
								source: "ai-block",
							}),
						});

						if (!response.ok) {
							throw new Error(await readErrorMessage(response, "Failed to generate response"));
						}

						// Handle streaming response
						const reader = response.body?.getReader();
						const decoder = new TextDecoder();
						let fullContent = "";

						if (reader) {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;

								const chunk = decoder.decode(value);
								fullContent += chunk;

								props.editor.updateBlock(props.block, {
									type: "aiBlock",
									props: {
										...props.block.props,
										prompt,
										response: fullContent,
										status: "generating",
									},
								});
							}
						}

						props.editor.updateBlock(props.block, {
							type: "aiBlock",
							props: {
								...props.block.props,
								prompt,
								response: fullContent,
								status: "done",
							},
						});

						notifyAiUsageChanged();
					} catch (error) {
						props.editor.updateBlock(props.block, {
							type: "aiBlock",
							props: {
								...props.block.props,
								prompt,
								status: "error",
								error: error instanceof Error ? error.message : "Something went wrong",
							},
						});
					} finally {
						setIsGenerating(false);
					}
				},
				[ensureSession, isGenerating, localPrompt, noteId, props],
			);

			const handleRetry = () => {
				const prompt = props.block.props.prompt;
				setLocalPrompt(prompt);
				void handleSubmit(prompt);
			};

			const handleDelete = () => {
				props.editor.removeBlocks([props.block]);
			};

			const handleInsert = () => {
				const finalContent = stripAssistantReasoning(props.block.props.response).trim();
				if (!finalContent) return;

				let newBlocks = parseRichTextToBlocks(props.editor, finalContent);

				if (newBlocks.length === 0) {
					newBlocks = [
						{
							type: "paragraph",
							content: finalContent,
						},
					];
				}

				// @ts-expect-error BlockNote's inserted block typing is narrower than the runtime-supported defaults here.
				props.editor.insertBlocks(newBlocks, props.block, "after");
				props.editor.removeBlocks([props.block]);
			};

			const handleAppendToEnd = async (content: string) => {
				const finalContent = content.trim();
				if (!finalContent) return;

				let newBlocks = parseRichTextToBlocks(props.editor, finalContent);

				if (newBlocks.length === 0) {
					newBlocks = [
						{
							type: "paragraph",
							content: finalContent,
						},
					];
				}

				const lastBlock = props.editor.document[props.editor.document.length - 1] ?? props.block;
				// @ts-expect-error BlockNote runtime supports inserting default blocks here.
				props.editor.insertBlocks(newBlocks, lastBlock, "after");
			};

			// Preview mode - just show the response
			if (isPreview) {
				if (!props.block.props.response) {
					return null;
				}
				return (
					<BlockContentWrapper
						blockType={props.block.type}
						blockProps={props.block.props}
						propSchema={props.editor.schema.blockSchema.aiBlock.propSchema}>
						<div
							className="rounded-[var(--sn-radius-lg)] border p-4"
							style={{
								borderColor: "rgba(124, 106, 255, 0.2)",
								backgroundColor: "rgba(124, 106, 255, 0.06)",
							}}>
							<div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
								<Sparkles className="h-3 w-3" style={{ color: "var(--sn-accent)" }} />
								AI Generated
							</div>
							<div className="mt-2 text-sm" style={{ color: "var(--text-primary)" }}>
								<AssistantContent content={props.block.props.response} />
							</div>
						</div>
					</BlockContentWrapper>
				);
			}

			return (
				<BlockContentWrapper
					blockType={props.block.type}
					blockProps={props.block.props}
					propSchema={props.editor.schema.blockSchema.aiBlock.propSchema}>
					<div
						className="rounded-[var(--sn-radius-lg)] border"
						style={{
							borderColor: "rgba(124, 106, 255, 0.2)",
							backgroundColor: "rgba(124, 106, 255, 0.06)",
						}}>
						{/* Input area */}
						{status === "idle" && (
							<div className="flex items-center gap-2 p-3">
								<Sparkles className="h-4 w-4 shrink-0" style={{ color: "var(--sn-accent)" }} />
								<input
									type="text"
									value={localPrompt}
									onChange={(e) => setLocalPrompt(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											void handleSubmit();
										}
									}}
									placeholder="Ask AI anything..."
									className="flex-1 bg-transparent text-sm focus:outline-none"
									style={{ color: "var(--text-primary)" }}
									autoFocus
								/>
								<button
									onClick={() => void handleSubmit()}
									disabled={!localPrompt.trim()}
									className="flex h-7 w-7 items-center justify-center rounded-md transition-opacity disabled:opacity-40"
									style={{ backgroundColor: "var(--sn-accent)" }}>
									<Send className="h-3.5 w-3.5 text-white" />
								</button>
							</div>
						)}

						{/* Generating state */}
						{(status === "generating" || isGenerating) && (
							<>
								<div className="flex items-center gap-2 border-b p-3" style={{ borderColor: "rgba(124, 106, 255, 0.2)" }}>
									<Sparkles className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />
									<span className="text-sm" style={{ color: "var(--text-secondary)" }}>
										{props.block.props.prompt || localPrompt}
									</span>
								</div>
								<div className="p-3">
									{props.block.props.response ? (
										<div className="text-sm" style={{ color: "var(--text-primary)" }}>
											<AssistantContent content={props.block.props.response} isStreaming />
										</div>
									) : (
										<div className="flex items-center gap-2">
											<Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--sn-accent)" }} />
											<span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
												Generating...
											</span>
										</div>
									)}
								</div>
							</>
						)}

						{/* Done state */}
						{status === "done" && props.block.props.response && (
							<>
								<div className="flex items-center gap-2 border-b p-3" style={{ borderColor: "rgba(124, 106, 255, 0.2)" }}>
									<Sparkles className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />
									<span className="text-sm" style={{ color: "var(--text-secondary)" }}>
										{props.block.props.prompt}
									</span>
								</div>
								<div className="p-3 text-sm" style={{ color: "var(--text-primary)" }}>
									<AssistantContent content={props.block.props.response} />
								</div>
								<div className="flex flex-wrap items-center gap-2 border-t p-2" style={{ borderColor: "rgba(124, 106, 255, 0.2)" }}>
									<AssistantResponseActions
										content={stripAssistantReasoning(props.block.props.response).trim()}
										onAppendToNote={handleAppendToEnd}
										showAppendButton={false}
									/>
									<button
										onClick={handleInsert}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[var(--sn-accent)] transition-colors hover:bg-[#1a1a1a]"
										style={{ color: "var(--sn-accent)" }}>
										<Plus className="h-3 w-3" />
										Insert into note
									</button>
									<button
										onClick={handleRetry}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-[#1a1a1a]"
										style={{ color: "var(--text-secondary)" }}>
										<RotateCcw className="h-3 w-3" />
										Retry
									</button>
									<button
										onClick={handleDelete}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
										style={{ color: "var(--destructive)" }}>
										<Trash2 className="h-3 w-3" />
										Delete
									</button>
								</div>
							</>
						)}

						{/* Error state */}
						{status === "error" && (
							<>
								<div className="flex items-center gap-2 border-b p-3" style={{ borderColor: "rgba(124, 106, 255, 0.2)" }}>
									<Sparkles className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />
									<span className="text-sm" style={{ color: "var(--text-secondary)" }}>
										{props.block.props.prompt}
									</span>
								</div>
								<div className="p-3 text-sm" style={{ color: "#ef4444" }}>
									{props.block.props.error || "Something went wrong"}
								</div>
								<div className="flex items-center gap-2 border-t p-2" style={{ borderColor: "rgba(124, 106, 255, 0.2)" }}>
									<button
										onClick={handleRetry}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-[#1a1a1a]"
										style={{ color: "var(--sn-accent)" }}>
										<RotateCcw className="h-3 w-3" />
										Retry
									</button>
									<button
										onClick={handleDelete}
										className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
										style={{ color: "var(--destructive)" }}>
										<Trash2 className="h-3 w-3" />
										Delete
									</button>
								</div>
							</>
						)}
					</div>
				</BlockContentWrapper>
			);
		},
	},
);
