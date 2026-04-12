"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SearchResponse, SearchResult } from "@/types/search";

interface SearchModalProps {
	workspaceId: string;
	open: boolean;
	onClose: () => void;
	onSelectNote: (noteId: string) => void;
}

function useDebounced<T>(value: T, delay: number) {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = window.setTimeout(() => setDebounced(value), delay);
		return () => window.clearTimeout(timer);
	}, [delay, value]);

	return debounced;
}

function normalizeSearchText(value: string) {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function tokenizeSearchQuery(query: string) {
	return normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function buildNormalizedTextMap(text: string) {
	let normalizedText = "";
	const originalIndexByNormalizedIndex: number[] = [];

	for (const [index, character] of Array.from(text).entries()) {
		const normalizedCharacter = character.normalize("NFD").replace(/\p{M}/gu, "");
		for (const normalizedPart of Array.from(normalizedCharacter)) {
			normalizedText += normalizedPart.toLowerCase();
			originalIndexByNormalizedIndex.push(index);
		}
	}

	return { normalizedText, originalIndexByNormalizedIndex };
}

function getHighlightedNodes(text: string, queryTokens: string[]): ReactNode {
	if (!text || queryTokens.length === 0) {
		return text;
	}

	const { normalizedText, originalIndexByNormalizedIndex } = buildNormalizedTextMap(text);
	if (!normalizedText) {
		return text;
	}

	const ranges: Array<{ start: number; end: number }> = [];

	for (const token of queryTokens) {
		let searchIndex = 0;
		while (searchIndex < normalizedText.length) {
			const matchIndex = normalizedText.indexOf(token, searchIndex);
			if (matchIndex === -1) {
				break;
			}

			ranges.push({
				start: matchIndex,
				end: matchIndex + token.length,
			});
			searchIndex = matchIndex + token.length;
		}
	}

	if (ranges.length === 0) {
		return text;
	}

	ranges.sort((left, right) => left.start - right.start || left.end - right.end);
	const mergedRanges: Array<{ start: number; end: number }> = [];

	for (const range of ranges) {
		const previousRange = mergedRanges[mergedRanges.length - 1];
		if (!previousRange || range.start > previousRange.end) {
			mergedRanges.push({ ...range });
			continue;
		}

		previousRange.end = Math.max(previousRange.end, range.end);
	}

	const nodes: ReactNode[] = [];
	let cursor = 0;

	for (const [index, range] of mergedRanges.entries()) {
		const startOriginalIndex = originalIndexByNormalizedIndex[range.start];
		const endOriginalIndex = originalIndexByNormalizedIndex[Math.min(range.end - 1, originalIndexByNormalizedIndex.length - 1)] + 1;
		const safeStartIndex = Math.max(cursor, startOriginalIndex ?? cursor);
		const safeEndIndex = Math.max(safeStartIndex, endOriginalIndex ?? safeStartIndex);

		if (safeStartIndex > cursor) {
			nodes.push(<Fragment key={`text-${index}`}>{text.slice(cursor, safeStartIndex)}</Fragment>);
		}

		nodes.push(
			<mark key={`match-${index}`} className="rounded-[0.18em] bg-[#a855f7]/25 px-[0.08em] py-[0.02em] text-inherit" style={{ color: "inherit" }}>
				{text.slice(safeStartIndex, safeEndIndex)}
			</mark>,
		);
		cursor = safeEndIndex;
	}

	if (cursor < text.length) {
		nodes.push(<Fragment key="text-tail">{text.slice(cursor)}</Fragment>);
	}

	return nodes;
}

export function SearchModal({ workspaceId, open, onClose, onSelectNote }: SearchModalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [requestError, setRequestError] = useState<string | null>(null);

	const debouncedQuery = useDebounced(query, 300);
	const highlightedQueryTokens = useMemo(() => tokenizeSearchQuery(debouncedQuery), [debouncedQuery]);

	useEffect(() => {
		if (!open) return;
		inputRef.current?.focus();
		setActiveIndex(0);
		setRequestError(null);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;

		if (!debouncedQuery.trim()) {
			setLoading(false);
			setRequestError(null);
			setResults([]);
			setActiveIndex(0);
			return;
		}

		const run = async () => {
			setLoading(true);
			setRequestError(null);
			try {
				const response = await fetch(`/api/search?workspaceId=${workspaceId}&query=${encodeURIComponent(debouncedQuery)}`);
				if (!response.ok) {
					throw new Error(`Search request failed with status ${response.status}`);
				}
				const data = (await response.json()) as SearchResponse;
				if (!cancelled) {
					setResults(data.results ?? []);
					setActiveIndex(0);
				}
			} catch (error) {
				console.error("[search-modal] search request failed", error);
				if (!cancelled) {
					setResults([]);
					setActiveIndex(0);
					setRequestError("Search is temporarily unavailable. Please try again.");
					toast.error("Search unavailable. Try again shortly.");
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		void run();
		return () => {
			cancelled = true;
		};
	}, [debouncedQuery, open, workspaceId]);

	useEffect(() => {
		if (!open) return;

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onClose();
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((prev) => Math.min(results.length - 1, prev + 1));
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((prev) => Math.max(0, prev - 1));
				return;
			}

			if (event.key === "Enter") {
				const selected = results[activeIndex];
				if (!selected) return;
				event.preventDefault();
				onSelectNote(selected.id);
				onClose();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeIndex, onClose, onSelectNote, open, results]);

	const emptyState = useMemo(() => {
		if (loading) return "Searching...";
		if (requestError) return requestError;
		if (!debouncedQuery.trim()) return "Start typing to search your notes";
		return `No notes found for "${debouncedQuery}"`;
	}, [debouncedQuery, loading, requestError]);

	if (!open) return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]"
			style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
			onClick={onClose}>
			<div
				className="flex w-full max-w-[600px] flex-col overflow-hidden rounded-[var(--sn-radius-lg)] border"
				style={{
					backgroundColor: "var(--bg-surface)",
					borderColor: "var(--border-strong)",
					maxHeight: "70vh",
				}}
				onClick={(event) => event.stopPropagation()}>
				<div className="flex h-12 items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<Search className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
					<input
						ref={inputRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search your notes..."
						className="flex-1 bg-transparent text-sm outline-none"
						style={{ color: "var(--text-primary)" }}
					/>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								onClick={onClose}
								className="rounded-[var(--sn-radius-sm)] p-1"
								style={{ color: "var(--text-tertiary)" }}
								aria-label="Close">
								<X className="h-4 w-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent>Close</TooltipContent>
					</Tooltip>
				</div>

				<div className="max-h-[calc(70vh-80px)] overflow-y-auto py-1">
					{loading ? (
						<div>
							{Array.from({ length: 3 }).map((_, index) => (
								<div key={index} className="w-full px-4 py-2 text-left">
									<div className="flex items-start gap-2">
										<div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full bg-white/5 animate-pulse" />
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<div className="h-4 w-3/5 rounded-full bg-white/5 animate-pulse" />
												<div className="h-4 w-16 rounded-full bg-white/5 animate-pulse" />
											</div>
											<div className="mt-1 space-y-1">
												<div className="h-3 w-2/5 rounded-full bg-white/5 animate-pulse" />
												<div className="h-3 w-1/3 rounded-full bg-white/5 animate-pulse" />
											</div>
										</div>
									</div>
								</div>
							))}
						</div>
					) : !results.length ? (
						<div className="flex min-h-36 items-center justify-center px-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
							{emptyState}
						</div>
					) : (
						<>
							<div className="px-4 py-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
								Results
							</div>
							{results.map((result, index) => {
								const active = index === activeIndex;

								return (
									<button
										key={result.id}
										className="w-full px-4 py-2 text-left"
										style={{ backgroundColor: active ? "var(--bg-hover)" : "transparent" }}
										onMouseEnter={() => setActiveIndex(index)}
										onClick={() => {
											onSelectNote(result.id);
											onClose();
										}}>
										<div className="flex items-start gap-2">
											<FileText className="mt-0.5 h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
														{getHighlightedNodes(result.title || "Untitled", highlightedQueryTokens)}
													</p>
												</div>
												{result.snippet ? (
													<p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-secondary)" }}>
														{getHighlightedNodes(result.snippet, highlightedQueryTokens)}
													</p>
												) : null}
											</div>
										</div>
									</button>
								);
							})}
						</>
					)}
				</div>

				<div
					className="flex h-8 items-center justify-center text-[11px]"
					style={{ borderTop: "1px solid var(--border-default)", color: "var(--text-tertiary)" }}>
					[↑↓ to navigate] [Enter to open] [Esc]
				</div>
			</div>
		</div>,
		document.body,
	);
}
