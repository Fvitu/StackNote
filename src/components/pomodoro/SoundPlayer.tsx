"use client";

import { useEffect, useRef, useState } from "react";
import { useMemo } from "react";

import type { AmbientSoundId } from "@/lib/sounds";
import { AMBIENT_SOUNDS } from "@/lib/sounds";

interface SoundPlayerProps {
	activeSounds: Set<AmbientSoundId>;
	unavailableSounds: Set<AmbientSoundId>;
	volume: number;
	onToggleSound: (soundId: AmbientSoundId) => void;
	onVolumeChange: (volume: number) => void;
}

export function SoundPlayer({ activeSounds, unavailableSounds, volume, onToggleSound, onVolumeChange }: SoundPlayerProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const dragStateRef = useRef<{
		pointerId: number;
		startX: number;
		startScrollLeft: number;
		hasDragged: boolean;
	} | null>(null);
	const didDragRef = useRef(false);
	const [isDragging, setIsDragging] = useState(false);

	const dragHandlers = useMemo(() => {
		const stopDragging = () => {
			dragStateRef.current = null;
			setIsDragging(false);
		};

		const handleWindowPointerMove = (event: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (dragState === null || dragState.pointerId !== event.pointerId || scrollRef.current === null) {
				return;
			}

			const deltaX = event.clientX - dragState.startX;

			if (!dragState.hasDragged && Math.abs(deltaX) > 4) {
				dragState.hasDragged = true;
				didDragRef.current = true;
				setIsDragging(true);
			}

			if (!dragState.hasDragged) {
				return;
			}

			event.preventDefault();
			scrollRef.current.scrollLeft = dragState.startScrollLeft - deltaX;
		};

		const handleWindowPointerUp = (event: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (dragState === null || dragState.pointerId !== event.pointerId) {
				return;
			}

			window.removeEventListener("pointermove", handleWindowPointerMove);
			window.removeEventListener("pointerup", handleWindowPointerUp);
			window.removeEventListener("pointercancel", handleWindowPointerCancel);
			stopDragging();
		};

		const handleWindowPointerCancel = (event: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (dragState === null || dragState.pointerId !== event.pointerId) {
				return;
			}

			window.removeEventListener("pointermove", handleWindowPointerMove);
			window.removeEventListener("pointerup", handleWindowPointerUp);
			window.removeEventListener("pointercancel", handleWindowPointerCancel);
			stopDragging();
		};

		const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0 || scrollRef.current === null || dragStateRef.current !== null) {
				return;
			}

			dragStateRef.current = {
				pointerId: event.pointerId,
				startX: event.clientX,
				startScrollLeft: scrollRef.current.scrollLeft,
				hasDragged: false,
			};
			didDragRef.current = false;

			window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
			window.addEventListener("pointerup", handleWindowPointerUp);
			window.addEventListener("pointercancel", handleWindowPointerCancel);
		};

		const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
			if (!didDragRef.current) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			didDragRef.current = false;
			setIsDragging(false);
		};

		return {
			handlePointerDown,
			handleClickCapture,
			handleWindowPointerMove,
			handleWindowPointerUp,
			handleWindowPointerCancel,
		};
	}, []);

	useEffect(() => {
		return () => {
			window.removeEventListener("pointermove", dragHandlers.handleWindowPointerMove);
			window.removeEventListener("pointerup", dragHandlers.handleWindowPointerUp);
			window.removeEventListener("pointercancel", dragHandlers.handleWindowPointerCancel);
		};
	}, [dragHandlers]);

	return (
		<div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border-default)" }}>
			<p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "var(--text-tertiary)" }}>
				Sounds
			</p>
			<div
				ref={scrollRef}
				onPointerDown={dragHandlers.handlePointerDown}
				onClickCapture={dragHandlers.handleClickCapture}
				className={`stacknote-scrollbar-hidden mt-3 overflow-x-hidden select-none overscroll-x-contain touch-pan-y rounded-2xl ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}>
				<div className="flex min-w-max items-center gap-2 px-0.5 py-0.5">
					{AMBIENT_SOUNDS.map((sound) => {
						const isActive = activeSounds.has(sound.id);
						const isUnavailable = unavailableSounds.has(sound.id);

						return (
							<button
								key={sound.id}
								type="button"
								disabled={isUnavailable}
								onClick={() => onToggleSound(sound.id)}
								className="inline-flex shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium text-center whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40"
								style={{
									backgroundColor: isActive ? "var(--accent-muted)" : "var(--bg-hover)",
									borderColor: isActive ? "var(--sn-accent)" : "var(--border-default)",
									color: isActive ? "var(--sn-accent)" : "var(--text-secondary)",
								}}>
								{sound.emoji} {sound.label}
							</button>
						);
					})}
				</div>
			</div>
			<div className="mt-4">
				<div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
					<span>Volume</span>
					<span>{volume}%</span>
				</div>
				<input
					type="range"
					min={0}
					max={100}
					value={volume}
					onChange={(event) => onVolumeChange(Number(event.target.value))}
					className="w-full"
					style={{ accentColor: "var(--sn-accent)" }}
				/>
			</div>
		</div>
	);
}
