"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { Pause, Play, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type PreviewableFile = {
	name: string;
	url: string;
	type: "pdf" | "audio" | "image";
} | null;

type ViewerSize = {
	width: number;
	height: number;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.25;
const MOBILE_BREAKPOINT = 768;

function formatSeconds(seconds: number) {
	if (!Number.isFinite(seconds)) {
		return "0:00";
	}

	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function clampZoom(value: number) {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));
}

function getFitScale(size: ViewerSize) {
	if (typeof window === "undefined") {
		return 1;
	}

	const horizontalPadding = window.innerWidth < MOBILE_BREAKPOINT ? 32 : 96;
	const verticalPadding = window.innerWidth < MOBILE_BREAKPOINT ? 160 : 220;
	const maxWidth = Math.max(280, window.innerWidth - horizontalPadding);
	const maxHeight = Math.max(220, window.innerHeight - verticalPadding);
	return Math.min(maxWidth / size.width, maxHeight / size.height, 1);
}

function ImagePreviewContent({ url, name }: { url: string; name: string }) {
	const [zoom, setZoom] = useState(1);
	const [fitScale, setFitScale] = useState(1);
	const [viewerSize, setViewerSize] = useState<ViewerSize | null>(null);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [isPanning, setIsPanning] = useState(false);
	const viewerWheelTargetRef = useRef<HTMLDivElement | null>(null);
	const dragStateRef = useRef<{
		startX: number;
		startY: number;
		startPanX: number;
		startPanY: number;
	} | null>(null);

	useEffect(() => {
		if (!viewerSize) {
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
	}, [viewerSize]);

	useEffect(() => {
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
	}, []);

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
			// Ignore capture failures.
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

	return (
		<div className="flex h-[75vh] w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[rgba(10,10,12,0.45)] text-white shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
			<div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-white">Image preview</p>
					<p className="truncate text-xs text-white/70">{name}</p>
				</div>
				<div className="ml-auto flex shrink-0 items-center gap-1">
					<button
						type="button"
						className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
						title="Zoom out"
						disabled={zoom <= MIN_ZOOM}
						onClick={() => adjustZoom(-ZOOM_STEP)}>
						<ZoomOut className="h-4 w-4" />
					</button>
					<div className="min-w-16 px-2 text-center text-xs tabular-nums text-white/75">{Math.round(zoom * 100)}%</div>
					<button
						type="button"
						className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
						title="Zoom in"
						disabled={zoom >= MAX_ZOOM}
						onClick={() => adjustZoom(ZOOM_STEP)}>
						<ZoomIn className="h-4 w-4" />
					</button>
				</div>
			</div>

			<div
				className="flex-1 overflow-hidden p-2 sm:p-4"
				style={{
					backgroundImage: "radial-gradient(circle at top, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 35%, rgba(0,0,0,0) 70%)",
				}}>
				<div
					ref={viewerWheelTargetRef}
					className="flex min-h-full min-w-full items-center justify-center overflow-hidden"
					draggable={false}
					onDragStart={(event) => event.preventDefault()}
					onPointerDown={(event) => event.stopPropagation()}>
					<img
						src={url}
						alt={name}
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
	);
}

function AudioPreviewContent({ url, name }: { url: string; name: string }) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolume] = useState(0.8);
	const [showVolume, setShowVolume] = useState(false);
	const lastNonZeroVolumeRef = useRef(0.8);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		audio.volume = volume;
	}, [volume]);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		const onTimeUpdate = () => setCurrentTime(audio.currentTime);
		const onLoaded = () => setDuration(audio.duration);
		const onPlay = () => setIsPlaying(true);
		const onPause = () => setIsPlaying(false);
		const onEnded = () => setIsPlaying(false);

		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("loadedmetadata", onLoaded);
		audio.addEventListener("play", onPlay);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("ended", onEnded);

		return () => {
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("loadedmetadata", onLoaded);
			audio.removeEventListener("play", onPlay);
			audio.removeEventListener("pause", onPause);
			audio.removeEventListener("ended", onEnded);
		};
	}, []);

	const progress = useMemo(() => {
		if (!duration) {
			return 0;
		}

		return Math.min(100, (currentTime / duration) * 100);
	}, [currentTime, duration]);

	const togglePlayback = async () => {
		const audio = audioRef.current;
		if (!audio) {
			return;
		}

		if (audio.paused) {
			await audio.play();
		} else {
			audio.pause();
		}
	};

	return (
		<div className="flex w-full max-w-2xl justify-center rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 sm:p-5">
			<div
				className="group flex w-full flex-col gap-3 rounded-[var(--sn-radius-lg)] border px-3 py-3"
				style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
				onMouseEnter={() => setShowVolume(true)}
				onMouseLeave={() => setShowVolume(false)}>
				<audio ref={audioRef} src={url} preload="metadata" />

				<div className="flex min-w-0 items-center gap-3 md:hidden">
					<button
						type="button"
						onClick={() => void togglePlayback()}
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
						{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
					</button>

					<div className="min-w-0 flex-1">
						<div className="truncate text-xs leading-4 text-[var(--text-secondary)]">{name || "Audio"}</div>
					</div>
				</div>

				<div className="relative h-1.5 w-full rounded-full md:hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
					<div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
					<input
						type="range"
						min={0}
						max={duration || 0}
						value={Math.min(currentTime, duration || 0)}
						onChange={(event) => {
							const next = Number(event.target.value);
							setCurrentTime(next);
							if (audioRef.current) {
								audioRef.current.currentTime = next;
							}
						}}
						className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 touch-none"
					/>
				</div>

				<div className="text-center text-xs text-[var(--text-secondary)] md:hidden">
					{formatSeconds(currentTime)} / {formatSeconds(duration)}
				</div>

				<div className="hidden min-w-0 items-center gap-3 md:flex">
					<button
						type="button"
						onClick={() => void togglePlayback()}
						className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
						{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
					</button>

					<div className="min-w-0 flex-1">
						<div className="truncate text-xs leading-4 text-[var(--text-secondary)]">{name || "Audio"}</div>
						<div className="relative mt-1 h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
							<div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
							<input
								type="range"
								min={0}
								max={duration || 0}
								value={Math.min(currentTime, duration || 0)}
								onChange={(event) => {
									const next = Number(event.target.value);
									setCurrentTime(next);
									if (audioRef.current) {
										audioRef.current.currentTime = next;
									}
								}}
								className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							/>
						</div>
					</div>

					<div className="w-20 shrink-0 whitespace-nowrap text-right text-xs text-[var(--text-secondary)]">
						{formatSeconds(currentTime)} / {formatSeconds(duration)}
					</div>

					<div className={`hidden items-center gap-2 overflow-hidden transition-all duration-150 md:flex ${showVolume ? "w-24 opacity-100" : "w-0 opacity-0"}`}>
						{volume === 0 ? <VolumeX className="h-3.5 w-3.5 text-[var(--text-tertiary)]" /> : <Volume2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />}
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={volume}
							onChange={(event) => {
								const next = Number(event.target.value);
								setVolume(next);
								if (next > 0) {
									lastNonZeroVolumeRef.current = next;
								}
							}}
							className="h-1.5 w-16 cursor-pointer appearance-none rounded-full"
							style={{
								background: `linear-gradient(to right, var(--sn-accent) ${Math.round(volume * 100)}%, rgba(255,255,255,0.08) ${Math.round(volume * 100)}%)`,
							}}
						/>
					</div>

					<button
						type="button"
						onClick={() => {
							const nextVolume = volume > 0 ? 0 : lastNonZeroVolumeRef.current || 0.8;
							setVolume(nextVolume);
						}}
						className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
						title={volume > 0 ? "Mute" : "Unmute"}>
						{volume > 0 ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
					</button>
				</div>
			</div>
		</div>
	);
}

export function FilePreviewModal({
	file,
	onClose,
}: {
	file: PreviewableFile;
	onClose: () => void;
}) {
	return (
		<Dialog open={file !== null} onOpenChange={(open) => !open && onClose()}>
			{file ? (
				<DialogPortal>
					<DialogOverlay className="bg-black/80 backdrop-blur-sm" />
					<div className="fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,64rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#111111] shadow-2xl">
						<div className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
							<DialogTitle className="truncate text-base font-medium text-white">{file.name}</DialogTitle>
							<DialogClose
								render={
									<Button type="button" variant="ghost" size="icon-sm" className="text-zinc-400 hover:bg-white/5 hover:text-white" />
								}>
								<span className="text-lg leading-none">✕</span>
								<span className="sr-only">Close</span>
							</DialogClose>
						</div>
						<div className="flex min-h-[75vh] items-center justify-center bg-[#0a0a0a] p-5">
							{file.type === "pdf" ? <iframe src={file.url} title={file.name} className="h-[75vh] w-full rounded-xl border border-white/5 bg-[#141414]" /> : null}
							{file.type === "audio" ? <AudioPreviewContent key={file.url} url={file.url} name={file.name} /> : null}
							{file.type === "image" ? <ImagePreviewContent key={file.url} url={file.url} name={file.name} /> : null}
						</div>
					</div>
				</DialogPortal>
			) : null}
		</Dialog>
	);
}
