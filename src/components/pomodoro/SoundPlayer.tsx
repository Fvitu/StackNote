"use client";

import { useEffect, useRef, useState } from "react";

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

	const handleWindowPointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
	const handleWindowPointerUpRef = useRef<((event: PointerEvent) => void) | null>(null);
	const handleWindowPointerCancelRef = useRef<((event: PointerEvent) => void) | null>(null);

	const stopDragging = () => {
		dragStateRef.current = null;
		setIsDragging(false);
	};

	if (handleWindowPointerMoveRef.current === null) {
		handleWindowPointerMoveRef.current = (event: PointerEvent) => {
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
	}

	if (handleWindowPointerUpRef.current === null) {
		handleWindowPointerUpRef.current = (event: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (dragState === null || dragState.pointerId !== event.pointerId) {
				return;
			}

			window.removeEventListener("pointermove", handleWindowPointerMoveRef.current!);
			window.removeEventListener("pointerup", handleWindowPointerUpRef.current!);
			window.removeEventListener("pointercancel", handleWindowPointerCancelRef.current!);
			stopDragging();
		};
	}

	if (handleWindowPointerCancelRef.current === null) {
		handleWindowPointerCancelRef.current = (event: PointerEvent) => {
			const dragState = dragStateRef.current;
			if (dragState === null || dragState.pointerId !== event.pointerId) {
				return;
			}

			window.removeEventListener("pointermove", handleWindowPointerMoveRef.current!);
			window.removeEventListener("pointerup", handleWindowPointerUpRef.current!);
			window.removeEventListener("pointercancel", handleWindowPointerCancelRef.current!);
			stopDragging();
		};
	}

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

		window.addEventListener("pointermove", handleWindowPointerMoveRef.current!, { passive: false });
		window.addEventListener("pointerup", handleWindowPointerUpRef.current!);
		window.addEventListener("pointercancel", handleWindowPointerCancelRef.current!);
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

	useEffect(() => {
		return () => {
			if (handleWindowPointerMoveRef.current !== null) {
				window.removeEventListener("pointermove", handleWindowPointerMoveRef.current);
			}

			if (handleWindowPointerUpRef.current !== null) {
				window.removeEventListener("pointerup", handleWindowPointerUpRef.current);
			}

			if (handleWindowPointerCancelRef.current !== null) {
				window.removeEventListener("pointercancel", handleWindowPointerCancelRef.current);
			}
		};
	}, []);

	return (
		<div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border-default)" }}>
			<p className="text-xs font-medium uppercase tracking-[0.2em]" style={{ color: "var(--text-tertiary)" }}>
				Sounds
			</p>
			<div
				ref={scrollRef}
				onPointerDown={handlePointerDown}
				onClickCapture={handleClickCapture}
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
