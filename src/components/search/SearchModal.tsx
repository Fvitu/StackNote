"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X, FileText } from "lucide-react";
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

export function SearchModal({ workspaceId, open, onClose, onSelectNote }: SearchModalProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [loading, setLoading] = useState(false);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);
	const [mode, setMode] = useState<"recent" | "search">("recent");
	const [requestError, setRequestError] = useState<string | null>(null);

	const debouncedQuery = useDebounced(query, 300);

	useEffect(() => {
		if (!open) return;
		inputRef.current?.focus();
		setActiveIndex(0);
		setRequestError(null);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;

		const run = async () => {
			setLoading(true);
			setRequestError(null);
			try {
				const response = await fetch(`/api/search?workspaceId=${workspaceId}&q=${encodeURIComponent(debouncedQuery)}`);
				if (!response.ok) {
					throw new Error(`Search request failed with status ${response.status}`);
				}
				const data = (await response.json()) as SearchResponse;
				if (!cancelled) {
					setResults(data.results ?? []);
					setMode(data.mode);
					setActiveIndex(0);
				}
			} catch (error) {
				console.error("[search-modal] search request failed", error);
				if (!cancelled) {
					setResults([]);
					setMode("search");
					setActiveIndex(0);
					setRequestError("Search is temporarily unavailable. Please try again.");
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
		if (!debouncedQuery.trim()) return "No recent notes";
		return `No notes found for "${debouncedQuery}"`;
	}, [debouncedQuery, loading, requestError]);

	const getMatchLabel = (matchType: SearchResult["matchType"]) => {
		if (matchType === "hybrid") return "Strong match";
		if (matchType === "semantic") return "Related";
		return "Exact match";
	};

	const getMatchBadgeClassName = (matchType: SearchResult["matchType"] | undefined) => {
		if (matchType === "hybrid") {
			return "bg-emerald-500/10 text-emerald-400";
		}
		if (matchType === "semantic") {
			return "bg-violet-500/10 text-[#7c6aff]";
		}
		if (matchType === "fulltext") {
			return "bg-blue-500/10 text-blue-400";
		}
		return null;
	};

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
					<button onClick={onClose} className="rounded-[var(--sn-radius-sm)] p-1" style={{ color: "var(--text-tertiary)" }}>
						<X className="h-4 w-4" />
					</button>
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
								{mode === "recent" ? "Recent" : "Results"}
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
											{result.emoji ? (
												<span className="mt-0.5 text-sm">{result.emoji}</span>
											) : (
												<FileText className="mt-0.5 h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
											)}
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
														{result.title || "Untitled"}
													</p>
													{mode === "search" && result.matchType ? (
														<span
															className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getMatchBadgeClassName(result.matchType) ?? ""}`}>
															{getMatchLabel(result.matchType)}
														</span>
													) : null}
												</div>
												{result.snippet ? (
													<p
														className="mt-1 line-clamp-2 text-xs [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:text-[#7c6aff]"
														style={{ color: "var(--text-secondary)" }}
														dangerouslySetInnerHTML={{ __html: result.snippet }}
													/>
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
