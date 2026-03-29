/* eslint-disable react-hooks/rules-of-hooks */

"use client"

import { useMemo, useRef, useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react"
import { createReactBlockSpec } from "@blocknote/react"
import { BlockContentWrapper } from "@blocknote/react"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

const WIDTH_PRESETS = [25, 50, 75, 100] as const

export const imageMediaBlockSpec = createReactBlockSpec(
	{
		type: "imageMedia",
		propSchema: {
			url: { default: "" },
			fileId: { default: "" },
			alt: { default: "" },
			width: { default: 25, type: "number" as const },
			caption: { default: "" },
			name: { default: "" },
			uploading: { default: false, type: "boolean" as const },
			progress: { default: 0, type: "number" as const },
			error: { default: "" },
		},
		content: "none",
	},
	{
		meta: {
			fileBlockAccept: ["image/*"],
		},
		render: (props) => {
			const [errored, setErrored] = useState(false);
			const imageRef = useRef<HTMLImageElement | null>(null);
			const isPreview = usePreviewMode();

			const width = WIDTH_PRESETS.includes(props.block.props.width as (typeof WIDTH_PRESETS)[number]) ? props.block.props.width : 25;

			const fileName = props.block.props.name || props.block.props.alt || "image";

			const containerStyle = useMemo(
				() => ({
					width: `${width}%`,
					maxWidth: "100%",
					marginInline: "auto",
				}),
				[width],
			);

			const setBlockProps = (next: Record<string, unknown>) => {
				props.editor.updateBlock(props.block, {
					type: "imageMedia",
					props: {
						...props.block.props,
						...next,
					},
				});
			};

			return (
				<BlockContentWrapper
					blockType={props.block.type}
					blockProps={props.block.props}
					propSchema={props.editor.schema.blockSchema.imageMedia.propSchema}>
					<div className={`mx-auto flex flex-col items-center ${isPreview ? "pointer-events-none select-none" : "group/imageMedia relative"}`} style={containerStyle}>
						{props.block.props.uploading ? (
							<div
								className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border pulse"
								style={{
									borderColor: "var(--border-strong)",
									background: "linear-gradient(120deg, #141414 0%, #1a1a1a 45%, #141414 100%)",
									minHeight: 200,
								}}>
								<div className="flex min-h-[200px] items-center justify-center" style={{ color: "var(--text-tertiary)" }}>
									<ImageIcon className="h-8 w-8" />
								</div>
								<div className="h-[2px] w-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
									<div
										className="h-full transition-all duration-150"
										style={{ width: `${Math.min(100, Math.max(0, props.block.props.progress))}%`, backgroundColor: "var(--sn-accent)" }}
									/>
								</div>
							</div>
						) : props.block.props.error || errored ? (
							<div
								className="w-full rounded-[var(--sn-radius-lg)] border px-4 py-8 text-center"
								style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.07)", color: "#fda4a4" }}>
								<p className="text-sm">Could not load image</p>
								<p className="mt-1 text-xs" style={{ color: "#fecaca" }}>
									{fileName}
								</p>
							</div>
						) : (
							<img
								ref={imageRef}
								src={props.block.props.url}
								alt={props.block.props.alt || fileName}
								className="mx-auto w-full rounded-[var(--sn-radius-lg)] border"
								style={{ borderColor: "var(--border-default)", objectFit: "contain" }}
								onError={() => setErrored(true)}
								draggable={false}
							/>
						)}
						{!isPreview && (
							<>
								<div
									className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-[var(--sn-radius-md)] border px-1.5 py-1 opacity-0 transition-opacity duration-150 group-hover/imageMedia:opacity-100"
									style={{ backgroundColor: "rgba(10,10,10,0.86)", borderColor: "var(--border-strong)" }}>
									{WIDTH_PRESETS.map((preset) => (
										<button
											key={preset}
											type="button"
											className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded text-[10px] font-medium"
											style={{
												color: preset === width ? "#ffffff" : "var(--text-tertiary)",
												backgroundColor: preset === width ? "var(--sn-accent)" : "transparent",
											}}
											onClick={() => setBlockProps({ width: preset })}>
											{preset}
										</button>
									))}
									<button
										type="button"
										className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded"
										style={{ color: "#fca5a5" }}
										onClick={() => props.editor.removeBlocks([props.block.id])}>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								</div>

								<input
									value={props.block.props.caption}
									onChange={(event) => setBlockProps({ caption: event.target.value })}
									placeholder="Add a caption..."
									className={`mt-2 w-full border-none bg-transparent text-center text-xs outline-none transition-opacity duration-150 ${
										props.block.props.caption
											? "opacity-100 pointer-events-auto"
											: "opacity-0 pointer-events-none group-hover/imageMedia:opacity-100 group-hover/imageMedia:pointer-events-auto"
									}`}
									style={{ color: "var(--text-secondary)" }}
								/>
							</>
						)}
					</div>
				</BlockContentWrapper>
			);
		},
	},
);
