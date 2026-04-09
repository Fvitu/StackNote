/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { ImageIcon, Maximize2, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { createReactBlockSpec } from "@blocknote/react";
import { BlockContentWrapper } from "@blocknote/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext";

const WIDTH_PRESETS = [25, 50, 75, 100] as const;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;
const MOBILE_BREAKPOINT = 768;
const DOUBLE_TAP_INTERVAL_MS = 320;
const DOUBLE_TAP_DISTANCE_PX = 24;

type ViewerSize = {
	width: number;
	height: number;
};

type TapInfo = {
	timestamp: number;
	x: number;
	y: number;
};

function clampZoom(value: number) {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function getFitScale(size: ViewerSize) {
	if (typeof window === "undefined") {
		return 1;
	}

	const horizontalPadding = window.innerWidth < MOBILE_BREAKPOINT ? 32 : 96;
	const verticalPadding = window.innerWidth < MOBILE_BREAKPOINT ? 120 : 180;
	const maxWidth = Math.max(280, window.innerWidth - horizontalPadding);
	const maxHeight = Math.max(220, window.innerHeight - verticalPadding);
	return Math.min(maxWidth / size.width, maxHeight / size.height, 1);
}

function isDoubleTap(previousTap: TapInfo | null, nextTap: TapInfo) {
	if (!previousTap) {
		return false;
	}

	const withinInterval = nextTap.timestamp - previousTap.timestamp <= DOUBLE_TAP_INTERVAL_MS;
	const tapDistance = Math.hypot(nextTap.x - previousTap.x, nextTap.y - previousTap.y);
	return withinInterval && tapDistance <= DOUBLE_TAP_DISTANCE_PX;
}

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
			const [isViewerOpen, setIsViewerOpen] = useState(false);
			const [isCompactLayout, setIsCompactLayout] = useState(false);
			const [zoom, setZoom] = useState(1);
			const [fitScale, setFitScale] = useState(1);
			const [viewerSize, setViewerSize] = useState<ViewerSize | null>(null);
			const [pan, setPan] = useState({ x: 0, y: 0 });
			const [isPanning, setIsPanning] = useState(false);
			const viewerWheelTargetRef = useRef<HTMLDivElement | null>(null);
			const blockTapRef = useRef<TapInfo | null>(null);
			const dragStateRef = useRef<{
				startX: number;
				startY: number;
				startPanX: number;
				startPanY: number;
			} | null>(null);
			const isPreview = usePreviewMode();

			const width = WIDTH_PRESETS.includes(props.block.props.width as (typeof WIDTH_PRESETS)[number]) ? props.block.props.width : 25;
			const effectiveWidth = isCompactLayout ? 100 : width;
			const fileName = props.block.props.name || props.block.props.alt || "image";
			const altText = props.block.props.alt || fileName;

			const containerStyle = useMemo(
				() => ({
					width: `${effectiveWidth}%`,
					maxWidth: "100%",
					marginInline: "auto",
				}),
				[effectiveWidth],
			);

			useEffect(() => {
				if (typeof window === "undefined") {
					return;
				}

				const syncViewportMode = () => {
					setIsCompactLayout(window.innerWidth < MOBILE_BREAKPOINT);
				};

				syncViewportMode();
				window.addEventListener("resize", syncViewportMode);
				return () => {
					window.removeEventListener("resize", syncViewportMode);
				};
			}, []);

			useEffect(() => {
				if (!isViewerOpen) {
					setZoom(1);
					setFitScale(1);
					setViewerSize(null);
					setPan({ x: 0, y: 0 });
					setIsPanning(false);
					dragStateRef.current = null;
				}
			}, [isViewerOpen]);

			useEffect(() => {
				if (!isViewerOpen || !viewerSize) {
					return;
				}

				const refreshFitScale = () => {
					setFitScale(getFitScale(viewerSize));
				};

				refreshFitScale();
				window.addEventListener("resize", refreshFitScale);
				return () => {
					window.removeEventListener("resize", refreshFitScale);
				};
			}, [isViewerOpen, viewerSize]);

			useEffect(() => {
				if (!isViewerOpen) {
					return;
				}

				const handleNativeWheel = (event: WheelEvent) => {
					const element = viewerWheelTargetRef.current;
					if (!element || !element.contains(event.target as Node)) {
						return;
					}

					event.preventDefault();
					event.stopPropagation();

					const scaleFactor = Math.exp(-event.deltaY * 0.002);
					setZoom((current) => {
						const nextZoom = clampZoom(current * scaleFactor);
						if (nextZoom <= 1) {
							setPan({ x: 0, y: 0 });
						}
						return nextZoom;
					});
				};

				window.addEventListener("wheel", handleNativeWheel, { passive: false, capture: true });
				return () => {
					window.removeEventListener("wheel", handleNativeWheel, { capture: true });
				};
			}, [isViewerOpen]);

			const openViewer = (initialZoom = 1) => {
				blockTapRef.current = null;
				setZoom(initialZoom);
				setIsViewerOpen(true);
			};

			const closeViewer = () => {
				setIsViewerOpen(false);
			};

			const adjustZoom = (delta: number) => {
				setZoom((current) => {
					const nextZoom = clampZoom(current + delta);
					if (nextZoom <= 1) {
						setPan({ x: 0, y: 0 });
					}
					return nextZoom;
				});
			};

			const handleViewerPointerDown = (event: ReactPointerEvent<HTMLImageElement>) => {
				if (zoom <= 1) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				dragStateRef.current = {
					startX: event.clientX,
					startY: event.clientY,
					startPanX: pan.x,
					startPanY: pan.y,
				};
				setIsPanning(true);
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {
					// Ignore capture failures; drag state still works while the pointer stays over the image.
				}
			};

			const handleViewerPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
				const dragState = dragStateRef.current;
				if (!dragState) {
					return;
				}

				event.preventDefault();
				setPan({
					x: dragState.startPanX + (event.clientX - dragState.startX),
					y: dragState.startPanY + (event.clientY - dragState.startY),
				});
			};

			const endViewerPan = (event: ReactPointerEvent<HTMLImageElement>) => {
				if (!dragStateRef.current) {
					return;
				}

				dragStateRef.current = null;
				setIsPanning(false);
				try {
					event.currentTarget.releasePointerCapture(event.pointerId);
				} catch {
					// Ignore release failures.
				}
			};

			const handleViewerImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
				const image = event.currentTarget;
				const nextSize = {
					width: image.naturalWidth || image.width,
					height: image.naturalHeight || image.height,
				};
				setViewerSize(nextSize);
				setFitScale(getFitScale(nextSize));
			};

			const setBlockProps = (next: Record<string, unknown>) => {
				props.editor.updateBlock(props.block, {
					type: "imageMedia",
					props: {
						...props.block.props,
						...next,
					},
				});
			};

			const handleBlockImagePointerUp = (event: ReactPointerEvent<HTMLImageElement>) => {
				if (isPreview || (event.pointerType !== "touch" && event.pointerType !== "pen")) {
					return;
				}

				const nextTap: TapInfo = {
					timestamp: Date.now(),
					x: event.clientX,
					y: event.clientY,
				};

				if (isDoubleTap(blockTapRef.current, nextTap)) {
					event.preventDefault();
					event.stopPropagation();
					blockTapRef.current = null;
					openViewer(1);
					return;
				}

				blockTapRef.current = nextTap;
			};

			return (
				<BlockContentWrapper
					blockType={props.block.type}
					blockProps={props.block.props}
					propSchema={props.editor.schema.blockSchema.imageMedia.propSchema}>
					<div
						className={`mx-auto flex flex-col items-center ${isPreview ? "pointer-events-none select-none" : "group/imageMedia relative"}`}
						style={containerStyle}>
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
								src={props.block.props.url}
								alt={altText}
								className={`mx-auto w-full rounded-[var(--sn-radius-lg)] border ${isPreview ? "" : "cursor-zoom-in"}`}
								style={{ borderColor: "var(--border-default)", objectFit: "contain", touchAction: "manipulation" }}
								loading="lazy"
								decoding="async"
								onError={() => setErrored(true)}
								draggable={false}
								onDragStart={(event) => event.preventDefault()}
								onPointerUp={handleBlockImagePointerUp}
								onDoubleClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									if (!isPreview) {
										openViewer(1);
									}
								}}
							/>
						)}
						{!isPreview && (
							<>
								<div
									className={`absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center justify-end gap-1 rounded-[var(--sn-radius-md)] border px-1.5 py-1 transition-opacity duration-150 ${
										isCompactLayout ? "opacity-100" : "pointer-events-none opacity-0 group-hover/imageMedia:opacity-100"
									}`}
									style={{ backgroundColor: "rgba(10,10,10,0.86)", borderColor: "var(--border-strong)" }}>
									<button
										type="button"
										className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded"
										style={{ color: "var(--text-tertiary)" }}
										title="Open full screen"
										onClick={() => openViewer(1)}>
										<Maximize2 className="h-3.5 w-3.5" />
									</button>
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
											: isCompactLayout
												? "opacity-100 pointer-events-auto"
												: "opacity-0 pointer-events-none group-hover/imageMedia:opacity-100 group-hover/imageMedia:pointer-events-auto"
									}`}
									style={{ color: "var(--text-secondary)" }}
								/>
							</>
						)}
					</div>

					<Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
						<DialogContent
							showCloseButton={false}
							className="!top-1/2 !left-1/2 !h-[100dvh] !w-[100vw] !max-w-none !-translate-x-1/2 !-translate-y-1/2 overflow-hidden border-0 bg-transparent p-0 shadow-none ring-0 sm:!h-[calc(100dvh-1rem)] sm:!w-[calc(100vw-1rem)] sm:!max-w-[min(1280px,96vw)] sm:border sm:border-white/10">
							<div className="flex h-full flex-col overflow-hidden border border-white/10 bg-[rgba(10,10,12,0.45)] text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:rounded-[inherit]">
								<DialogHeader className="border-b px-3 py-2.5 sm:px-4 sm:py-3" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
									<div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
										<div className="min-w-0 flex-1">
											<DialogTitle className="text-sm font-medium text-white">Image preview</DialogTitle>
											<DialogDescription className="truncate text-xs text-white/70">{fileName}</DialogDescription>
										</div>
										<div className="ml-auto flex shrink-0 items-center gap-1">
											<button
												type="button"
												className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 sm:h-8 sm:w-8"
												title="Zoom out"
												disabled={zoom <= MIN_ZOOM}
												onClick={() => adjustZoom(-ZOOM_STEP)}>
												<ZoomOut className="h-4 w-4" />
											</button>
											<div className="min-w-14 px-2 text-center text-[11px] tabular-nums text-white/75 sm:min-w-16 sm:text-xs">
												{Math.round(zoom * 100)}%
											</div>
											<button
												type="button"
												className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 sm:h-8 sm:w-8"
												title="Zoom in"
												disabled={zoom >= MAX_ZOOM}
												onClick={() => adjustZoom(ZOOM_STEP)}>
												<ZoomIn className="h-4 w-4" />
											</button>
											<button
												type="button"
												className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 sm:h-8 sm:w-8"
												title="Close preview"
												onClick={closeViewer}>
												<X className="h-4 w-4" />
											</button>
										</div>
									</div>
								</DialogHeader>

								<div
									className="flex-1 overflow-hidden p-2 sm:p-4"
									style={{
										backgroundImage:
											"radial-gradient(circle at top, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 35%, rgba(0,0,0,0) 70%)",
									}}>
									<div
										ref={viewerWheelTargetRef}
										className="flex min-h-full min-w-full items-center justify-center overflow-hidden"
										draggable={false}
										onDragStart={(event) => event.preventDefault()}
										onPointerDown={(event) => event.stopPropagation()}>
										<img
											src={props.block.props.url}
											alt={altText}
											className="block max-w-none rounded-[var(--sn-radius-lg)]"
											style={{
												width: viewerSize ? `${viewerSize.width * fitScale}px` : "auto",
												height: "auto",
												maxWidth: "none",
												maxHeight: "none",
												objectFit: "contain",
												transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
												transformOrigin: "center center",
												cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
												userSelect: "none",
												touchAction: "none",
												transition: isPanning ? "none" : "transform 160ms ease-out",
												willChange: "transform",
											}}
											draggable={false}
											onDragStart={(event) => event.preventDefault()}
											onLoad={handleViewerImageLoad}
											onError={() => setErrored(true)}
											loading="eager"
											decoding="async"
											onPointerDown={handleViewerPointerDown}
											onPointerMove={handleViewerPointerMove}
											onPointerUp={endViewerPan}
											onPointerCancel={endViewerPan}
											onClick={(event) => event.stopPropagation()}
											onDoubleClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												adjustZoom(ZOOM_STEP);
											}}
										/>
									</div>
								</div>
							</div>
						</DialogContent>
					</Dialog>
				</BlockContentWrapper>
			);
		},
	},
);
