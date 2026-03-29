"use client";

import {
	type MouseEvent as ReactMouseEvent,
	type TouchEvent as ReactTouchEvent,
	useCallback,
	startTransition,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Check, ExternalLink, Crosshair, Move, ImagePlus, Link2, Loader2, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isValidHttpUrl, resolveNoteCoverMeta, type NoteCoverMeta, type UnsplashCoverSearchResult } from "@/lib/note-cover";

type CoverTab = "gallery" | "upload" | "link";

interface CoverUpdateResponse {
	coverImage: string | null;
	coverImageMeta: unknown;
	updatedAt: string;
}

interface NoteCoverPanelProps {
	noteId: string;
	coverImage: string | null;
	coverImageMeta: unknown;
	onCoverUpdated: (payload: CoverUpdateResponse) => void;
}

const COVER_TABS: Array<{ id: CoverTab; label: string; icon: typeof Sparkles }> = [
	{ id: "gallery", label: "Gallery", icon: Sparkles },
	{ id: "upload", label: "Upload", icon: Upload },
	{ id: "link", label: "Link", icon: Link2 },
];

const SUGGESTED_QUERIES = ["Minimal", "Architecture", "Nature", "Abstract", "Night city"] as const;

const COVER_PAGE_SIZE = 18;
const COVER_DRAG_SENSITIVITY = 0.35;

interface CoverSearchPayload {
	error?: string;
	results?: UnsplashCoverSearchResult[];
	page?: number;
	totalPages?: number;
}

interface CoverSearchCacheEntry {
	results: UnsplashCoverSearchResult[];
	page: number;
	hasMore: boolean;
}

interface DragStartPoint {
	y: number;
	startCoverY: number;
}

function clampPosition(value: number): number {
	return Math.min(100, Math.max(0, value));
}

function mergePhotoResults(previous: UnsplashCoverSearchResult[], incoming: UnsplashCoverSearchResult[]): UnsplashCoverSearchResult[] {
	const seen = new Set(previous.map((item) => item.id));
	const merged = [...previous];

	for (const photo of incoming) {
		if (seen.has(photo.id)) {
			continue;
		}
		merged.push(photo);
		seen.add(photo.id);
	}

	return merged;
}

function buildMetaWithPosition(meta: NoteCoverMeta | null, coverImage: string | null, positionX: number, positionY: number): NoteCoverMeta | null {
	const nextPositionX = clampPosition(positionX);
	const nextPositionY = clampPosition(positionY);

	if (!meta) {
		if (!coverImage || !isValidHttpUrl(coverImage)) {
			return null;
		}

		return {
			source: "external",
			originalUrl: coverImage,
			positionX: nextPositionX,
			positionY: nextPositionY,
		};
	}

	if (meta.source === "upload") {
		return {
			...meta,
			positionX: nextPositionX,
			positionY: nextPositionY,
		};
	}

	if (meta.source === "unsplash") {
		return {
			...meta,
			positionX: nextPositionX,
			positionY: nextPositionY,
		};
	}

	return {
		...meta,
		positionX: nextPositionX,
		positionY: nextPositionY,
	};
}

async function parseCoverResponse(response: Response): Promise<CoverUpdateResponse> {
	const payload = (await response.json().catch(() => null)) as (CoverUpdateResponse & { error?: string }) | { error?: string } | null;

	if (!response.ok) {
		throw new Error(payload && "error" in payload && payload.error ? payload.error : "Failed to update cover");
	}

	if (!payload || !("coverImage" in payload) || !("updatedAt" in payload)) {
		throw new Error("Invalid cover response");
	}

	return payload as CoverUpdateResponse;
}

export function NoteCoverPanel({ noteId, coverImage, coverImageMeta, onCoverUpdated }: NoteCoverPanelProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<CoverTab>("gallery");
	const [searchQuery, setSearchQuery] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const [searchResults, setSearchResults] = useState<UnsplashCoverSearchResult[]>([]);
	const [loadedPage, setLoadedPage] = useState(0);
	const [hasMoreResults, setHasMoreResults] = useState(false);
	const [isSearching, setIsSearching] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [linkUrl, setLinkUrl] = useState("");
	const [isApplying, setIsApplying] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);
	const [isPositioning, setIsPositioning] = useState(false);
	const [isDraggingPosition, setIsDraggingPosition] = useState(false);
	const [draftPosition, setDraftPosition] = useState({ x: 50, y: 50 });
	const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
	const searchCacheRef = useRef<Record<string, CoverSearchCacheEntry>>({});
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
	const coverFrameRef = useRef<HTMLDivElement | null>(null);
	const dragStartRef = useRef<DragStartPoint | null>(null);

	const currentQuery = deferredSearchQuery.trim();
	const currentQueryKey = currentQuery.toLowerCase();

	const currentCoverMeta = useMemo(() => resolveNoteCoverMeta(coverImage, coverImageMeta), [coverImage, coverImageMeta]);

	const currentCoverPosition = useMemo(
		() => ({
			x: clampPosition(currentCoverMeta?.positionX ?? 50),
			y: clampPosition(currentCoverMeta?.positionY ?? 50),
		}),
		[currentCoverMeta?.positionX, currentCoverMeta?.positionY],
	);

	useEffect(() => {
		if (!isDialogOpen) {
			return;
		}

		if (currentCoverMeta?.source === "external" && coverImage) {
			setLinkUrl(coverImage);
		}
	}, [coverImage, currentCoverMeta, isDialogOpen]);

	useEffect(() => {
		setDraftPosition(currentCoverPosition);
		setIsPositioning(false);
		setIsDraggingPosition(false);
	}, [currentCoverPosition, coverImage]);

	const fetchGalleryPage = useCallback(async (query: string, page: number, append: boolean) => {
		if (append) {
			setIsLoadingMore(true);
		} else {
			setIsSearching(true);
		}

		setSearchError(null);

		try {
			const response = await fetch(`/api/cover-images?query=${encodeURIComponent(query)}&page=${page}&perPage=${COVER_PAGE_SIZE}`, {
				cache: "no-store",
			});

			const payload = (await response.json().catch(() => null)) as CoverSearchPayload | null;

			if (!response.ok) {
				throw new Error(payload?.error ?? "Failed to fetch cover images");
			}

			const incomingResults = Array.isArray(payload?.results) ? payload.results : [];
			const cached = searchCacheRef.current[query.toLowerCase()];
			const baseResults = append && cached ? cached.results : [];
			const mergedResults = append ? mergePhotoResults(baseResults, incomingResults) : incomingResults;

			const totalPages = typeof payload?.totalPages === "number" ? payload.totalPages : undefined;
			const hasMore = totalPages ? page < totalPages : incomingResults.length >= COVER_PAGE_SIZE;

			searchCacheRef.current[query.toLowerCase()] = {
				results: mergedResults,
				page,
				hasMore,
			};

			startTransition(() => {
				setSearchResults(mergedResults);
				setLoadedPage(page);
				setHasMoreResults(hasMore);
			});
		} catch (error) {
			if (!append) {
				setSearchResults([]);
				setLoadedPage(0);
				setHasMoreResults(false);
			}

			setSearchError(error instanceof Error ? error.message : "Failed to fetch cover images");
		} finally {
			setIsSearching(false);
			setIsLoadingMore(false);
		}
	}, []);

	useEffect(() => {
		if (!isDialogOpen || activeTab !== "gallery") {
			return;
		}

		const cached = searchCacheRef.current[currentQueryKey];
		if (cached) {
			startTransition(() => {
				setSearchResults(cached.results);
				setLoadedPage(cached.page);
				setHasMoreResults(cached.hasMore);
			});
			return;
		}

		void fetchGalleryPage(currentQuery, 1, false);
	}, [activeTab, currentQuery, currentQueryKey, fetchGalleryPage, isDialogOpen]);

	useEffect(() => {
		if (!isDialogOpen || activeTab !== "gallery") {
			return;
		}

		const sentinel = loadMoreSentinelRef.current;
		if (!sentinel) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const first = entries[0];
				if (!first?.isIntersecting) {
					return;
				}

				if (isSearching || isLoadingMore || !hasMoreResults || loadedPage < 1) {
					return;
				}

				void fetchGalleryPage(currentQuery, loadedPage + 1, true);
			},
			{
				rootMargin: "300px 0px",
			},
		);

		observer.observe(sentinel);

		return () => {
			observer.disconnect();
		};
	}, [activeTab, currentQuery, fetchGalleryPage, hasMoreResults, isDialogOpen, isLoadingMore, isSearching, loadedPage]);

	const applyCover = async (
		payload: {
			coverImage: string;
			coverImageMeta: NoteCoverMeta;
			downloadLocation?: string;
		},
		options?: { closeDialog?: boolean; clearSelectedPhoto?: boolean },
	) => {
		const closeDialog = options?.closeDialog ?? true;
		const clearSelectedPhoto = options?.clearSelectedPhoto ?? true;

		setIsApplying(true);
		setActionError(null);

		try {
			const response = await fetch(`/api/notes/${noteId}/cover`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			const updated = await parseCoverResponse(response);
			onCoverUpdated(updated);
			if (closeDialog) {
				setIsDialogOpen(false);
			}
		} catch (error) {
			setActionError(error instanceof Error ? error.message : "Failed to update cover");
		} finally {
			setIsApplying(false);
			if (clearSelectedPhoto) {
				setSelectedPhotoId(null);
			}
		}
	};

	const handleUnsplashSelect = async (photo: UnsplashCoverSearchResult) => {
		setSelectedPhotoId(photo.id);
		await applyCover({
			coverImage: photo.regularUrl,
			coverImageMeta: {
				source: "unsplash",
				photoId: photo.id,
				thumbUrl: photo.thumbUrl,
				photographerName: photo.photographerName,
				photographerUrl: photo.photographerUrl,
				photoUrl: photo.photoUrl,
				positionX: 50,
				positionY: 50,
			},
			downloadLocation: photo.downloadLocation,
		});
	};

	const handleLinkApply = async () => {
		const trimmed = linkUrl.trim();
		if (!isValidHttpUrl(trimmed)) {
			setActionError("Enter a valid http or https image URL.");
			return;
		}

		await applyCover({
			coverImage: trimmed,
			coverImageMeta: {
				source: "external",
				originalUrl: trimmed,
				positionX: 50,
				positionY: 50,
			},
		});
	};

	const updateDraftPositionByDragDelta = useCallback((clientY: number) => {
		const frame = coverFrameRef.current;
		if (!frame) {
			return;
		}

		const dragStart = dragStartRef.current;
		if (!dragStart) {
			return;
		}

		const rect = frame.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}

		const deltaY = clientY - dragStart.y;
		const deltaPercent = (deltaY / rect.height) * 100;
		const adjustedDeltaPercent = -deltaPercent * COVER_DRAG_SENSITIVITY;

		setDraftPosition((previous) => ({
			...previous,
			y: clampPosition(dragStart.startCoverY + adjustedDeltaPercent),
		}));
	}, []);

	const handleCoverMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			if (!isPositioning) {
				return;
			}

			const target = event.target as HTMLElement;
			if (target.closest("[data-cover-controls='true']")) {
				return;
			}

			event.preventDefault();
			dragStartRef.current = { y: event.clientY, startCoverY: draftPosition.y };
		},
		[draftPosition.y, isPositioning],
	);

	const handleCoverTouchStart = useCallback(
		(event: ReactTouchEvent<HTMLDivElement>) => {
			if (!isPositioning) {
				return;
			}

			const target = event.target as HTMLElement;
			if (target.closest("[data-cover-controls='true']")) {
				return;
			}

			const touch = event.touches[0];
			if (!touch) {
				return;
			}

			dragStartRef.current = { y: touch.clientY, startCoverY: draftPosition.y };
		},
		[draftPosition.y, isPositioning],
	);

	useEffect(() => {
		if (!isPositioning) {
			return;
		}

		const DRAG_THRESHOLD_PX = 4;

		const onMouseMove = (event: MouseEvent) => {
			if (!dragStartRef.current) {
				return;
			}

			const deltaY = Math.abs(event.clientY - dragStartRef.current.y);
			if (!isDraggingPosition && deltaY < DRAG_THRESHOLD_PX) {
				return;
			}

			if (!isDraggingPosition) {
				setIsDraggingPosition(true);
			}

			updateDraftPositionByDragDelta(event.clientY);
		};

		const onTouchMove = (event: TouchEvent) => {
			if (!dragStartRef.current) {
				return;
			}

			const touch = event.touches[0];
			if (!touch) {
				return;
			}

			const deltaY = Math.abs(touch.clientY - dragStartRef.current.y);
			if (!isDraggingPosition && deltaY < DRAG_THRESHOLD_PX) {
				return;
			}

			if (!isDraggingPosition) {
				setIsDraggingPosition(true);
			}

			updateDraftPositionByDragDelta(touch.clientY);
		};

		const stopDragging = () => {
			setIsDraggingPosition(false);
			dragStartRef.current = null;
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", stopDragging);
		window.addEventListener("touchmove", onTouchMove, { passive: true });
		window.addEventListener("touchend", stopDragging);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", stopDragging);
			window.removeEventListener("touchmove", onTouchMove);
			window.removeEventListener("touchend", stopDragging);
		};
	}, [isDraggingPosition, isPositioning, updateDraftPositionByDragDelta]);

	const handleSavePosition = async () => {
		if (!coverImage) {
			return;
		}

		const coverImageMetaWithPosition = buildMetaWithPosition(currentCoverMeta, coverImage, draftPosition.x, draftPosition.y);

		if (!coverImageMetaWithPosition) {
			setActionError("Failed to save cover position");
			return;
		}

		await applyCover(
			{
				coverImage,
				coverImageMeta: coverImageMetaWithPosition,
			},
			{
				closeDialog: false,
				clearSelectedPhoto: false,
			},
		);

		setIsPositioning(false);
	};

	const handleUploadClick = () => {
		uploadInputRef.current?.click();
	};

	const handleUploadChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";

		if (!file) {
			return;
		}

		setIsApplying(true);
		setActionError(null);

		try {
			const formData = new FormData();
			formData.append("file", file);

			const response = await fetch(`/api/notes/${noteId}/cover`, {
				method: "POST",
				body: formData,
			});

			const updated = await parseCoverResponse(response);
			onCoverUpdated(updated);
			setIsDialogOpen(false);
		} catch (error) {
			setActionError(error instanceof Error ? error.message : "Failed to upload cover");
		} finally {
			setIsApplying(false);
		}
	};

	const handleRemoveCover = async () => {
		setIsRemoving(true);
		setActionError(null);

		try {
			const response = await fetch(`/api/notes/${noteId}/cover`, {
				method: "DELETE",
			});

			const updated = await parseCoverResponse(response);
			onCoverUpdated(updated);
			setIsDialogOpen(false);
		} catch (error) {
			setActionError(error instanceof Error ? error.message : "Failed to remove cover");
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<>
			{coverImage ? (
				<div className="mx-auto mb-6 w-full max-w-[95vw]">
					<div
						ref={coverFrameRef}
						className="group relative overflow-hidden rounded-[30px] border"
						style={{
							borderColor: "var(--border-default)",
							backgroundColor: "var(--bg-surface)",
							minHeight: "250px",
							cursor: isPositioning ? "move" : "default",
						}}
						onMouseDown={handleCoverMouseDown}
						onTouchStart={handleCoverTouchStart}>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={coverImage}
							alt="Note cover"
							className="absolute inset-0 h-full w-full object-cover"
							style={{
								objectPosition: `${isPositioning ? draftPosition.x : currentCoverPosition.x}% ${isPositioning ? draftPosition.y : currentCoverPosition.y}%`,
								userSelect: "none",
							}}
							draggable={false}
						/>
						<div className="absolute inset-0 bg-gradient-to-b from-black/12 via-black/10 to-black/80" />

						{isPositioning && (
							<div
								className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-xs"
								style={{
									color: "white",
									borderColor: "rgba(255,255,255,0.2)",
									backgroundColor: "rgba(8,8,8,0.58)",
									backdropFilter: "blur(6px)",
								}}>
								Drag to reposition
							</div>
						)}

						<div
							className={`absolute right-4 top-4 flex flex-wrap items-center gap-2 transition-opacity duration-150 ${
								isPositioning ? "" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
							}`}
							data-cover-controls="true">
							{isPositioning ? (
								<>
									<button
										type="button"
										onClick={() => setDraftPosition({ x: 50, y: 50 })}
										className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
										style={{
											borderColor: "rgba(255,255,255,0.18)",
											backgroundColor: "rgba(8,8,8,0.58)",
											color: "white",
										}}>
										<Crosshair className="h-3.5 w-3.5" />
										Center
									</button>
									<button
										type="button"
										onClick={() => void handleSavePosition()}
										disabled={isApplying}
										className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm disabled:opacity-60"
										style={{
											borderColor: "rgba(255,255,255,0.18)",
											backgroundColor: "rgba(8,8,8,0.58)",
											color: "white",
										}}>
										<Check className="h-3.5 w-3.5" />
										{isApplying ? "Saving..." : "Save position"}
									</button>
									<button
										type="button"
										onClick={() => {
											setDraftPosition(currentCoverPosition);
											setIsPositioning(false);
										}}
										className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
										style={{
											borderColor: "rgba(255,255,255,0.18)",
											backgroundColor: "rgba(8,8,8,0.58)",
											color: "white",
										}}>
										<X className="h-3.5 w-3.5" />
										Cancel
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={() => {
										setDraftPosition(currentCoverPosition);
										setIsPositioning(true);
									}}
									className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
									style={{
										borderColor: "rgba(255,255,255,0.18)",
										backgroundColor: "rgba(8,8,8,0.58)",
										color: "white",
									}}>
									<Move className="h-3.5 w-3.5" />
									Reposition
								</button>
							)}

							<button
								type="button"
								onClick={() => setIsDialogOpen(true)}
								className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm"
								style={{
									borderColor: "rgba(255,255,255,0.18)",
									backgroundColor: "rgba(8,8,8,0.58)",
									color: "white",
								}}>
								<ImagePlus className="h-3.5 w-3.5" />
								Change cover
							</button>

							<button
								type="button"
								onClick={() => void handleRemoveCover()}
								disabled={isApplying || isRemoving}
								className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm disabled:opacity-60"
								style={{
									borderColor: "rgba(255,255,255,0.18)",
									backgroundColor: "rgba(8,8,8,0.58)",
									color: "white",
								}}>
								<Trash2 className="h-3.5 w-3.5" />
								{isRemoving ? "Removing..." : "Remove"}
							</button>
						</div>

						{currentCoverMeta?.source === "unsplash" && (
							<div
								className={`absolute bottom-4 left-4 rounded-full border px-3 py-1.5 text-[11px] backdrop-blur-sm transition-opacity duration-150 ${
									isPositioning ? "" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
								}`}>
								<a
									href={currentCoverMeta.photoUrl}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1.5"
									style={{
										color: "white",
									}}>
									<span>Photo by {currentCoverMeta.photographerName}</span>
									<ExternalLink className="h-3 w-3" />
								</a>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="mx-auto mb-4 flex w-full items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => setIsDialogOpen(true)}
						className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
						style={{
							color: "var(--text-secondary)",
							backgroundColor: "var(--bg-surface)",
							border: "1px solid var(--border-default)",
						}}>
						<ImagePlus className="h-4 w-4" />
						Add cover
					</button>
				</div>
			)}

			<Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
				<DialogContent
					showCloseButton={!isApplying && !isRemoving}
					className="!top-1/2 !left-1/2 !w-[calc(100vw-1.5rem)] !max-w-[min(1160px,96vw)] !-translate-x-1/2 !-translate-y-1/2 p-0">
					<div className="flex min-h-[680px] flex-col" style={{ backgroundColor: "var(--bg-surface)" }}>
						<DialogHeader className="border-b px-5 py-4" style={{ borderColor: "var(--border-default)" }}>
							<DialogTitle className="text-base">Choose a cover</DialogTitle>
							<DialogDescription>Upload your own image, paste a direct link, or browse a curated Unsplash gallery.</DialogDescription>
						</DialogHeader>

						<div className="border-b px-4 py-3" style={{ borderColor: "var(--border-default)" }}>
							<div className="flex flex-wrap items-center gap-2">
								{COVER_TABS.map((tab) => {
									const Icon = tab.icon;
									const isActive = activeTab === tab.id;

									return (
										<button
											key={tab.id}
											type="button"
											onClick={() => {
												setActiveTab(tab.id);
												setActionError(null);
											}}
											className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm"
											style={{
												backgroundColor: isActive ? "var(--accent-muted)" : "transparent",
												color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
												border: `1px solid ${isActive ? "rgba(124, 106, 255, 0.35)" : "var(--border-default)"}`,
											}}>
											<Icon className="h-4 w-4" />
											{tab.label}
										</button>
									);
								})}

								{coverImage && (
									<button
										type="button"
										onClick={() => void handleRemoveCover()}
										disabled={isApplying || isRemoving}
										className="ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm disabled:opacity-60"
										style={{
											color: "#f5b7b1",
											backgroundColor: "rgba(239, 68, 68, 0.08)",
											border: "1px solid rgba(239, 68, 68, 0.2)",
										}}>
										<Trash2 className="h-4 w-4" />
										{isRemoving ? "Removing..." : "Remove cover"}
									</button>
								)}
							</div>
						</div>

						<div className="flex-1 overflow-y-auto p-5">
							{activeTab === "gallery" && (
								<div className="space-y-4">
									<div className="flex flex-col gap-3 lg:flex-row lg:items-center">
										<div className="relative flex-1">
											<Search
												className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
												style={{ color: "var(--text-tertiary)" }}
											/>
											<Input
												value={searchQuery}
												onChange={(event) => setSearchQuery(event.target.value)}
												placeholder="Search for a cover image..."
												className="h-10 pl-9"
											/>
										</div>
										<div className="flex flex-wrap gap-2">
											{SUGGESTED_QUERIES.map((query) => (
												<button
													key={query}
													type="button"
													onClick={() => setSearchQuery(query)}
													className="rounded-full px-3 py-1.5 text-xs"
													style={{
														color: "var(--text-secondary)",
														backgroundColor: "var(--bg-hover)",
														border: "1px solid var(--border-default)",
													}}>
													{query}
												</button>
											))}
										</div>
									</div>

									{searchError && (
										<div
											className="rounded-2xl border px-4 py-3 text-sm"
											style={{
												borderColor: "rgba(239, 68, 68, 0.18)",
												backgroundColor: "rgba(239, 68, 68, 0.08)",
												color: "#f2b7b7",
											}}>
											{searchError}
										</div>
									)}

									{isSearching ? (
										<div
											className="flex h-56 items-center justify-center rounded-[28px] border"
											style={{ borderColor: "var(--border-default)" }}>
											<div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
												<Loader2 className="h-4 w-4 animate-spin" />
												Loading covers...
											</div>
										</div>
									) : (
										<div className="space-y-4">
											{searchResults.length === 0 ? (
												<div
													className="flex h-40 items-center justify-center rounded-[28px] border"
													style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
													No covers found for this query.
												</div>
											) : (
												<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
													{searchResults.map((photo) => (
														<button
															key={photo.id}
															type="button"
															onClick={() => void handleUnsplashSelect(photo)}
															disabled={isApplying}
															className="group overflow-hidden rounded-[24px] border text-left disabled:opacity-60"
															style={{
																borderColor:
																	selectedPhotoId === photo.id ? "rgba(124, 106, 255, 0.45)" : "var(--border-default)",
																backgroundColor: "var(--bg-hover)",
															}}>
															<div className="relative h-32 overflow-hidden md:h-36">
																{/* eslint-disable-next-line @next/next/no-img-element */}
																<img
																	src={photo.thumbUrl}
																	alt={photo.alt}
																	className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
																/>
																<div
																	className="absolute inset-0"
																	style={{
																		background:
																			"linear-gradient(180deg, rgba(5,5,5,0.02) 0%, rgba(5,5,5,0.08) 50%, rgba(5,5,5,0.72) 100%)",
																	}}
																/>
																{selectedPhotoId === photo.id && (
																	<div className="absolute inset-0 flex items-center justify-center">
																		<div
																			className="rounded-full border px-3 py-1 text-xs backdrop-blur-sm"
																			style={{
																				color: "white",
																				borderColor: "rgba(255,255,255,0.18)",
																				backgroundColor: "rgba(8,8,8,0.58)",
																			}}>
																			Applying...
																		</div>
																	</div>
																)}
															</div>
															<div className="space-y-1 px-3 py-3">
																<div className="line-clamp-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
																	{photo.alt}
																</div>
																<a
																	href={photo.photoUrl}
																	target="_blank"
																	rel="noreferrer"
																	onClick={(event) => event.stopPropagation()}
																	className="inline-flex items-center gap-1 text-xs"
																	style={{ color: "var(--text-secondary)" }}>
																	by {photo.photographerName}
																	<ExternalLink className="h-3 w-3" />
																</a>
															</div>
														</button>
													))}
												</div>
											)}

											<div ref={loadMoreSentinelRef} className="h-px w-full" />

											{isLoadingMore && (
												<div className="flex items-center justify-center gap-2 py-2 text-xs" style={{ color: "var(--text-secondary)" }}>
													<Loader2 className="h-3.5 w-3.5 animate-spin" />
													Loading more covers...
												</div>
											)}

											{!isLoadingMore && hasMoreResults && loadedPage > 0 && (
												<div className="flex justify-center">
													<button
														type="button"
														onClick={() => void fetchGalleryPage(currentQuery, loadedPage + 1, true)}
														className="rounded-full border px-3 py-1.5 text-xs"
														style={{
															borderColor: "var(--border-default)",
															color: "var(--text-secondary)",
															backgroundColor: "var(--bg-hover)",
														}}>
														Load more
													</button>
												</div>
											)}

											{!hasMoreResults && searchResults.length > 0 && (
												<div className="text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
													All loaded covers are shown.
												</div>
											)}
										</div>
									)}
								</div>
							)}

							{activeTab === "upload" && (
								<div className="mx-auto flex max-w-2xl flex-col gap-4">
									<div
										className="rounded-[30px] border px-6 py-12 text-center"
										style={{
											borderColor: "var(--border-default)",
											background: "linear-gradient(180deg, rgba(124, 106, 255, 0.08) 0%, rgba(17,17,17,0.92) 100%)",
										}}>
										<div
											className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
											style={{ backgroundColor: "rgba(124, 106, 255, 0.14)", color: "var(--sn-accent)" }}>
											<Upload className="h-6 w-6" />
										</div>
										<h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
											Upload your own cover
										</h3>
										<p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--text-secondary)" }}>
											Pick any image you want and we will attach it directly to this note.
										</p>
										<div className="mt-5">
											<Button onClick={handleUploadClick} disabled={isApplying} className="h-9 px-4">
												{isApplying ? (
													<>
														<Loader2 className="h-4 w-4 animate-spin" />
														Uploading...
													</>
												) : (
													<>
														<Upload className="h-4 w-4" />
														Choose image
													</>
												)}
											</Button>
										</div>
										<p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
											PNG, JPG, WEBP, GIF, and other image formats are supported.
										</p>
										<input ref={uploadInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadChange} />
									</div>
								</div>
							)}

							{activeTab === "link" && (
								<div className="mx-auto flex max-w-2xl flex-col gap-4">
									<div
										className="rounded-[30px] border p-6"
										style={{
											borderColor: "var(--border-default)",
											backgroundColor: "var(--bg-hover)",
										}}>
										<h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
											Use an image URL
										</h3>
										<p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
											Paste a direct image link if you already know exactly which cover you want.
										</p>
										<div className="mt-5 flex flex-col gap-3 sm:flex-row">
											<Input
												value={linkUrl}
												onChange={(event) => setLinkUrl(event.target.value)}
												placeholder="https://example.com/cover.jpg"
												className="h-10"
											/>
											<Button onClick={() => void handleLinkApply()} disabled={isApplying} className="h-10 px-4 sm:min-w-32">
												{isApplying ? (
													<>
														<Loader2 className="h-4 w-4 animate-spin" />
														Applying...
													</>
												) : (
													"Apply cover"
												)}
											</Button>
										</div>
										<p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
											For best results, use a landscape image.
										</p>
									</div>
								</div>
							)}

							{actionError && (
								<div
									className="mt-4 rounded-2xl border px-4 py-3 text-sm"
									style={{
										borderColor: "rgba(239, 68, 68, 0.18)",
										backgroundColor: "rgba(239, 68, 68, 0.08)",
										color: "#f2b7b7",
									}}>
									{actionError}
								</div>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
