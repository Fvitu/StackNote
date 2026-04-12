"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildFileAccessUrl } from "@/lib/file-url";
import { parseNoteCoverMeta } from "@/lib/note-cover";

interface RecentNote {
	id: string;
	title: string;
	emoji: string | null;
	updatedAt: string | Date;
	coverImage: string | null;
	coverImageMeta?: unknown;
}

interface RecentNotesCardProps {
	notes: RecentNote[];
}

const COVER_COLORS = ["#1e1a2e", "#1a2230", "#1e2a1e", "#2a1e1e", "#1c2630", "#2a2418", "#1d1d2b", "#1f2b26"] as const;

function getNoteCoverColor(id: string) {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash * 31 + id.charCodeAt(index)) % COVER_COLORS.length;
	}

	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

function resolveCoverImage(note: RecentNote) {
	const meta = parseNoteCoverMeta(note.coverImageMeta);
	if (meta?.source === "upload") {
		return buildFileAccessUrl(meta.fileId);
	}

	return note.coverImage;
}

function truncateWithDots(value: string, maxLength = 42) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function RecentNotesCard({ notes }: RecentNotesCardProps) {
	const router = useRouter();
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
			if (event.button !== 0 || event.pointerType !== "mouse" || scrollRef.current === null || dragStateRef.current !== null) {
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
		<section className="rounded-[24px] border border-white/5 bg-[#111111] p-5">
			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Recently Visited</p>
				<p className="text-sm text-zinc-400">Quick access to the notes you opened most recently.</p>
			</div>

			<div
				ref={scrollRef}
				onPointerDown={dragHandlers.handlePointerDown}
				onClickCapture={dragHandlers.handleClickCapture}
				className={`stacknote-scrollbar-hidden mt-5 overflow-x-auto pb-2 select-none overscroll-x-contain cursor-default`}>
				<div className="flex min-w-max flex-row gap-3">
					{notes.length === 0 ? (
						<div className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-white/5 bg-[#141414] text-sm text-zinc-500">
							No recent notes yet.
						</div>
					) : (
						notes.map((note) => {
							const coverImage = resolveCoverImage(note);
							const noteTitle = note.title || "Untitled";

							return (
								<div
									key={note.id}
									role="link"
									tabIndex={0}
									draggable={false}
									onDragStart={(event) => event.preventDefault()}
									onClick={() => router.push(`/note/${note.id}`)}
									onAuxClick={(e) => e.preventDefault()}
									onContextMenu={(e) => e.preventDefault()}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											router.push(`/note/${note.id}`);
										}
									}}
									className={`h-36 w-40 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-[#141414] transition-colors hover:border-white/10 hover:bg-[#1a1a1a] ${isDragging ? "cursor-grabbing" : "cursor-pointer"}`}>
									<div
										className="h-16 w-full overflow-hidden"
										style={{ backgroundColor: coverImage ? undefined : getNoteCoverColor(note.id) }}>
										{coverImage ? (
											<Image src={coverImage} alt="" width={320} height={128} unoptimized className="h-full w-full object-cover" />
										) : null}
									</div>
									<div className="flex h-20 flex-col px-3 pb-3">
										<div className="-mt-4 ml-1 text-2xl leading-none">{note.emoji ?? "📝"}</div>
										<p className="mt-2 line-clamp-1 text-sm font-medium text-white">{truncateWithDots(noteTitle)}</p>
										<p className="mt-2 text-xs text-zinc-500">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</section>
	);
}
