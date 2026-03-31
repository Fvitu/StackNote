"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, CheckSquare, Layers, Plus, Search, Send, Square, Sparkles, Trash2, X } from "lucide-react";
import { ChatMessage, type Message } from "./ChatMessage";
import { ModelSelector } from "./ModelSelector";
import { SuggestedPrompts } from "./SuggestedPrompts";
import { UsageIndicator } from "./UsageIndicator";
import type { FlashcardDeckPayload } from "@/components/flashcards/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_TEXT_MODEL, isValidTextModel, type TextModelId } from "@/lib/groq-models";
import { noteContentToText } from "@/lib/ai/note-content";
import { parseFlashcardDeckMessage } from "@/lib/flashcard-chat-message";
import { fetchJson } from "@/lib/api-client";
import { readErrorMessage, readJsonResponse } from "@/lib/http";
import { notifyAiUsageChanged } from "@/lib/ai-usage-events";
import { queryKeys } from "@/lib/query-keys";

export interface AISidePanelProps {
	workspaceId: string;
	noteId: string;
	noteTitle?: string;
	noteContent?: unknown;
	onAppendToNote?: (markdown: string) => boolean;
	isOpen: boolean;
	onClose: () => void;
}

interface ContextNoteOption {
	id: string;
	title: string;
	emoji?: string | null;
	path: string;
	contentText?: string;
}

interface ContextNotesResponse {
	notes: ContextNoteOption[];
}

interface ChatSessionSummary {
	id: string;
	title: string;
	workspaceId: string;
	noteId: string | null;
	contextNoteIds: string[];
	lastMessageAt: string | null;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
}

interface ChatSessionResponse {
	session: ChatSessionSummary;
}

interface ChatSessionListResponse {
	sessions: ChatSessionSummary[];
}

interface ChatSessionDetailResponse {
	session: ChatSessionSummary;
	messages: Array<{ id: string; role: "user" | "assistant"; content: string; timestamp: string; model?: string }>;
}

interface CachedChatSessionState {
	session: ChatSessionSummary;
	messages: Message[];
	selectedNoteIds: string[];
	contextSelectionMode: ContextSelectionMode;
}

const STORAGE_PREFIX = "ai-active-session-id:";
const CONTEXT_MODE_STORAGE_PREFIX = "ai-context-selection-mode:";
const GenerateFlashcardsDialogClient = dynamic(
	() => import("@/components/flashcards/GenerateFlashcardsDialog").then((module) => module.GenerateFlashcardsDialog),
	{
		ssr: false,
		loading: () => (
			<Dialog open>
				<DialogContent showCloseButton={false} className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Generate flashcards</DialogTitle>
						<DialogDescription>Preparing the flashcard generator…</DialogDescription>
					</DialogHeader>
					<div className="space-y-3">
						<div className="stacknote-skeleton h-10 rounded-[10px]" />
						<div className="stacknote-skeleton h-10 rounded-[10px]" />
						<div className="stacknote-skeleton h-24 rounded-[14px]" />
					</div>
				</DialogContent>
			</Dialog>
		),
	},
);

type ContextSelectionMode = "current" | "all" | "manual";

function readStoredActiveSessionId(workspaceId: string) {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`);
}

function writeStoredActiveSessionId(workspaceId: string, sessionId: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(`${STORAGE_PREFIX}${workspaceId}`, sessionId);
}

function writeStoredContextSelectionMode(workspaceId: string, sessionId: string, mode: ContextSelectionMode) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(`${CONTEXT_MODE_STORAGE_PREFIX}${workspaceId}:${sessionId}`, mode);
}

function readStoredContextSelectionMode(workspaceId: string, sessionId: string): ContextSelectionMode | null {
	if (typeof window === "undefined") return null;
	const value = window.localStorage.getItem(`${CONTEXT_MODE_STORAGE_PREFIX}${workspaceId}:${sessionId}`);
	if (value === "current" || value === "all" || value === "manual") return value;
	return null;
}

function areSameIds(left: string[], right: string[]) {
	if (left.length !== right.length) return false;
	return left.every((id, index) => id === right[index]);
}

function isAllSelection(selectedIds: string[], availableNotes: ContextNoteOption[]) {
	if (availableNotes.length === 0 || selectedIds.length !== availableNotes.length) return false;
	const selectedSet = new Set(selectedIds);
	return availableNotes.every((note) => selectedSet.has(note.id));
}

function inferContextSelectionMode(
	session: ChatSessionSummary,
	selectedIds: string[],
	availableNotes: ContextNoteOption[],
	currentNoteId: string,
): ContextSelectionMode {
	if (isAllSelection(selectedIds, availableNotes)) return "all";
	if (selectedIds.length === 1) {
		const selectedId = selectedIds[0];
		if (selectedId === currentNoteId || (session.noteId && selectedId === session.noteId)) return "current";
	}
	return "manual";
}

function buildCurrentNoteOption(noteId: string, noteTitle?: string): ContextNoteOption {
	return {
		id: noteId,
		title: noteTitle?.trim() || "Untitled",
		path: "Current note",
	};
}

function ensureCurrentNoteOption(options: ContextNoteOption[], noteId: string, noteTitle?: string) {
	if (options.some((option) => option.id === noteId)) return options;
	return [buildCurrentNoteOption(noteId, noteTitle), ...options];
}

function normalizeSelection(selectedNoteIds: string[], availableNotes: ContextNoteOption[], fallbackNoteId: string) {
	const availableIds = new Set(availableNotes.map((note) => note.id));
	const nextSelection = selectedNoteIds.filter((noteId) => availableIds.has(noteId));
	if (nextSelection.length > 0) return nextSelection;
	return availableIds.has(fallbackNoteId) ? [fallbackNoteId] : [];
}

function hydrateChatMessage(message: { id: string; role: "user" | "assistant"; content: string; timestamp: string; model?: string }): Message {
	const flashcardDeck = message.role === "assistant" ? parseFlashcardDeckMessage(message.content) : null;
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		timestamp: new Date(message.timestamp),
		model: message.model,
		flashcardDeck: flashcardDeck ?? undefined,
	};
}

export function AISidePanel({ workspaceId, noteId, noteTitle, noteContent, onAppendToNote, isOpen, onClose }: AISidePanelProps) {
	const queryClient = useQueryClient();
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [model, setModel] = useState<TextModelId>(DEFAULT_TEXT_MODEL);
	const [error, setError] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const [isSessionsLoading, setIsSessionsLoading] = useState(true);
	const [sessionsError, setSessionsError] = useState<string | null>(null);
	const [isCreatingSession, setIsCreatingSession] = useState(false);
	const [isSessionLoading, setIsSessionLoading] = useState(false);
	const [availableNotes, setAvailableNotes] = useState<ContextNoteOption[]>(() => [buildCurrentNoteOption(noteId, noteTitle)]);
	const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(() => [noteId]);
	const [notesLoading, setNotesLoading] = useState(true);
	const [notesError, setNotesError] = useState<string | null>(null);
	const [noteSearch, setNoteSearch] = useState("");
	const [isChatHistoryOpen, setIsChatHistoryOpen] = useState(false);
	const [isNoteAccessOpen, setIsNoteAccessOpen] = useState(false);
	const [sessionPendingDeletion, setSessionPendingDeletion] = useState<ChatSessionSummary | null>(null);
	const [isDeletingSession, setIsDeletingSession] = useState(false);
	const [contextSelectionMode, setContextSelectionMode] = useState<ContextSelectionMode>("current");
	const [isFlashcardDialogOpen, setIsFlashcardDialogOpen] = useState(false);

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const noteAccessTriggerRef = useRef<HTMLButtonElement>(null);
	const noteAccessPopoverRef = useRef<HTMLDivElement>(null);
	const activeSessionIdRef = useRef<string | null>(null);
	const activeSessionRef = useRef<ChatSessionSummary | null>(null);
	const selectedNoteIdsRef = useRef<string[]>([noteId]);
	const availableNotesRef = useRef<ContextNoteOption[]>([buildCurrentNoteOption(noteId, noteTitle)]);
	const messagesSessionIdRef = useRef<string | null>(null);
	const sessionStateCacheRef = useRef(new Map<string, CachedChatSessionState>());
	const sessionLoadRequestIdRef = useRef(0);
	const suppressSessionHydrationRef = useRef(false);

	const settingsQuery = useQuery({
		queryKey: queryKeys.settings,
		queryFn: () => fetchJson<{ preferredTextModel?: string }>("/api/settings"),
		initialData: () => queryClient.getQueryData<{ preferredTextModel?: string }>(queryKeys.settings),
		staleTime: 60_000,
		enabled: isOpen,
	});

	const contextNotesQuery = useQuery({
		queryKey: ["ai", "context-notes", workspaceId],
		queryFn: () => fetchJson<ContextNotesResponse>(`/api/ai/context-notes?workspaceId=${encodeURIComponent(workspaceId)}`),
		staleTime: 30_000,
		enabled: isOpen,
	});

	useEffect(() => {
		activeSessionIdRef.current = activeSessionId;
	}, [activeSessionId]);

	useEffect(() => {
		selectedNoteIdsRef.current = selectedNoteIds;
	}, [selectedNoteIds]);

	useEffect(() => {
		availableNotesRef.current = availableNotes;
	}, [availableNotes]);

	useEffect(() => {
		activeSessionRef.current = sessions.find((session) => session.id === activeSessionId) ?? null;
	}, [activeSessionId, sessions]);

	useEffect(() => {
		const end = messagesEndRef.current;
		if (!end) return;
		const last = messages[messages.length - 1];
		if (isLoading && last?.role === "assistant") {
			end.scrollIntoView({ behavior: "auto" });
		} else {
			end.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages, isLoading]);

	useEffect(() => {
		if (!isOpen) return;
		inputRef.current?.focus();
	}, [isOpen]);

	useEffect(() => {
		const inputElement = inputRef.current;
		if (!inputElement) return;
		const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0;
		const dynamicMaxHeight = Math.min(240, Math.max(56, 56 + Math.ceil(wordCount / 8) * 16));
		inputElement.style.height = "auto";
		inputElement.style.maxHeight = `${dynamicMaxHeight}px`;
		inputElement.style.height = `${Math.min(inputElement.scrollHeight, dynamicMaxHeight)}px`;
	}, [input]);

	useEffect(() => {
		const preferredTextModel = settingsQuery.data?.preferredTextModel;
		if (preferredTextModel && isValidTextModel(preferredTextModel)) {
			setModel(preferredTextModel);
		}
	}, [settingsQuery.data?.preferredTextModel]);

	useEffect(() => {
		const nextAvailableNotes = ensureCurrentNoteOption(contextNotesQuery.data?.notes ?? [], noteId, noteTitle);
		setAvailableNotes(nextAvailableNotes);
		setSelectedNoteIds((previousSelection) => normalizeSelection(previousSelection, nextAvailableNotes, noteId));
		setNotesLoading(contextNotesQuery.isLoading);
		setNotesError(contextNotesQuery.isError ? contextNotesQuery.error?.message ?? "Failed to load notes" : null);
	}, [contextNotesQuery.data?.notes, contextNotesQuery.error?.message, contextNotesQuery.isError, contextNotesQuery.isLoading, noteId, noteTitle]);

	const normalizeCachedSelection = useCallback(
		(selectedIds: string[]) => normalizeSelection(selectedIds.length > 0 ? selectedIds : [noteId], availableNotesRef.current, noteId),
		[noteId],
	);

	const upsertSession = useCallback((nextSession: ChatSessionSummary) => {
		setSessions((previousSessions) => [nextSession, ...previousSessions.filter((session) => session.id !== nextSession.id)]);
	}, []);

	const hydrateSessionState = useCallback(
		(session: ChatSessionSummary, nextMessages: Message[], nextSelection: string[], nextMode: ContextSelectionMode) => {
			messagesSessionIdRef.current = session.id;
			upsertSession(session);
			setActiveSessionId(session.id);
			setMessages(nextMessages);
			setSelectedNoteIds(nextSelection);
			setContextSelectionMode(nextMode);
			setError(null);
			writeStoredActiveSessionId(workspaceId, session.id);
		},
		[upsertSession, workspaceId],
	);

	const createSession = useCallback(
		async (contextNoteIds: string[], title?: string) => {
			setIsCreatingSession(true);
			setSessionsError(null);
			try {
				const response = await fetch("/api/ai/sessions", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId, noteId, noteTitle, title, contextNoteIds }),
				});
				const data = await readJsonResponse<ChatSessionResponse>(response);
				if (!response.ok || !data?.session) {
					throw new Error(await readErrorMessage(response, "Failed to create chat session"));
				}
				const nextSelection = normalizeCachedSelection(contextNoteIds);
				const nextMode = inferContextSelectionMode(data.session, nextSelection, availableNotesRef.current, noteId);
				hydrateSessionState(data.session, [], nextSelection, nextMode);
				sessionStateCacheRef.current.set(data.session.id, {
					session: data.session,
					messages: [],
					selectedNoteIds: nextSelection,
					contextSelectionMode: nextMode,
				});
				return data.session;
			} finally {
				setIsCreatingSession(false);
			}
		},
		[hydrateSessionState, normalizeCachedSelection, noteId, noteTitle, workspaceId],
	);

	const persistSessionContext = useCallback(
		async (sessionId: string, contextNoteIds: string[]) => {
			const response = await fetch(`/api/ai/sessions/${sessionId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ contextNoteIds }),
			});
			const data = await readJsonResponse<ChatSessionResponse>(response);
			if (!response.ok || !data?.session) {
				throw new Error(await readErrorMessage(response, "Failed to update chat session"));
			}
			upsertSession(data.session);
			return data.session;
		},
		[upsertSession],
	);

	const loadSessionDetails = useCallback(
		async (sessionId: string) => {
			const requestId = ++sessionLoadRequestIdRef.current;
			setIsSessionLoading(true);
			setError(null);
			try {
				const cachedSession = sessionStateCacheRef.current.get(sessionId);
				if (cachedSession) {
					const nextSelection = normalizeCachedSelection(cachedSession.selectedNoteIds);
					const nextMode = cachedSession.contextSelectionMode;
					upsertSession(cachedSession.session);
					hydrateSessionState(cachedSession.session, cachedSession.messages, nextSelection, nextMode);
					return;
				}

				const response = await fetch(`/api/ai/sessions/${sessionId}`);
				const data = await readJsonResponse<ChatSessionDetailResponse>(response);
				if (!response.ok || !data?.session) {
					throw new Error(await readErrorMessage(response, "Failed to load chat session"));
				}
				if (requestId !== sessionLoadRequestIdRef.current) return;
				const shouldPreserveOptimisticMessages = suppressSessionHydrationRef.current && sessionId === activeSessionIdRef.current;
				const nextSelection = normalizeCachedSelection(
					data.session.contextNoteIds.length > 0 ? data.session.contextNoteIds : [noteId],
				);
				const nextMode = readStoredContextSelectionMode(workspaceId, sessionId) ?? inferContextSelectionMode(data.session, nextSelection, availableNotesRef.current, noteId);
				upsertSession(data.session);
				sessionStateCacheRef.current.set(sessionId, {
					session: data.session,
					messages: data.messages.map((message) => hydrateChatMessage(message)),
					selectedNoteIds: nextSelection,
					contextSelectionMode: nextMode,
				});
				if (shouldPreserveOptimisticMessages) return;
				hydrateSessionState(
					data.session,
					data.messages.map((message) => hydrateChatMessage(message)),
					nextSelection,
					nextMode,
				);
			} finally {
				if (requestId === sessionLoadRequestIdRef.current) setIsSessionLoading(false);
			}
		},
		[hydrateSessionState, noteId, normalizeCachedSelection, upsertSession, workspaceId],
	);

	useEffect(() => {
		let ignore = false;
		async function loadSessions() {
			setIsSessionsLoading(true);
			setSessionsError(null);
			try {
				const response = await fetch(`/api/ai/sessions?workspaceId=${encodeURIComponent(workspaceId)}`);
				const data = await readJsonResponse<ChatSessionListResponse>(response);
				if (!response.ok || !data) throw new Error(await readErrorMessage(response, "Failed to load chat sessions"));
				if (ignore) return;
				setSessions(data.sessions);
				const storedSessionId = readStoredActiveSessionId(workspaceId);
				const storedSession = storedSessionId ? data.sessions.find((session) => session.id === storedSessionId) : null;
				const currentSession = activeSessionIdRef.current ? data.sessions.find((session) => session.id === activeSessionIdRef.current) : null;
				const nextSessionId = currentSession?.id ?? storedSession?.id ?? data.sessions[0]?.id ?? null;
				if (nextSessionId) {
					setActiveSessionId(nextSessionId);
					writeStoredActiveSessionId(workspaceId, nextSessionId);
					return;
				}
				setActiveSessionId(null);
				setMessages([]);
			} catch (loadError) {
				if (ignore) return;
				console.error("Failed to load AI chat sessions:", loadError);
				setSessionsError(loadError instanceof Error ? loadError.message : "Failed to load sessions");
			} finally {
				if (!ignore) setIsSessionsLoading(false);
			}
		}
		void loadSessions();
		return () => {
			ignore = true;
		};
	}, [workspaceId]);

	useEffect(() => {
		if (activeSessionId === null) {
			setMessages([]);
			return;
		}
		const sessionId = activeSessionId;
		let ignore = false;
		async function hydrateSession() {
			await loadSessionDetails(sessionId);
			if (ignore) return;
		}
		void hydrateSession();
		return () => {
			ignore = true;
		};
	}, [activeSessionId, loadSessionDetails]);

	useEffect(() => {
		if (!activeSessionId) return;
		writeStoredContextSelectionMode(workspaceId, activeSessionId, contextSelectionMode);
	}, [activeSessionId, contextSelectionMode, workspaceId]);

	useEffect(() => {
		if (!isNoteAccessOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (noteAccessPopoverRef.current?.contains(target) || noteAccessTriggerRef.current?.contains(target)) return;
			setIsNoteAccessOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsNoteAccessOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isNoteAccessOpen]);

	useEffect(() => {
		if (!isChatHistoryOpen) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsChatHistoryOpen(false);
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [isChatHistoryOpen]);

	const filteredNotes = useMemo(() => {
		const query = noteSearch.trim().toLowerCase();
		if (!query) return availableNotes;
		return availableNotes.filter(
			(note) => note.title.toLowerCase().includes(query) || note.path.toLowerCase().includes(query) || note.contentText?.toLowerCase().includes(query),
		);
	}, [availableNotes, noteSearch]);

	const defaultFlashcardSourceText = useMemo(() => noteContentToText(noteContent).trim(), [noteContent]);

	const selectedCount = selectedNoteIds.length;
	const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) ?? null, [activeSessionId, sessions]);
	const isConversationLocked = isLoading || isSessionsLoading || isSessionLoading || isCreatingSession;

	useEffect(() => {
		const sessionId = messagesSessionIdRef.current;
		if (!sessionId) return;
		const session = sessions.find((candidate) => candidate.id === sessionId);
		if (!session) return;

		sessionStateCacheRef.current.set(sessionId, {
			session,
			messages,
			selectedNoteIds: [...selectedNoteIds],
			contextSelectionMode,
		});
	}, [contextSelectionMode, messages, selectedNoteIds, sessions]);

	const updateSessionContext = useCallback(
		(nextSelection: string[]) => {
			setSelectedNoteIds((previousSelection) => (areSameIds(previousSelection, nextSelection) ? previousSelection : nextSelection));
			if (!activeSessionId) return;
			const activeContext = activeSessionRef.current?.contextNoteIds ?? [];
			if (areSameIds(activeContext, nextSelection)) return;
			void persistSessionContext(activeSessionId, nextSelection).catch((contextError) => {
				console.error("Failed to update AI chat session context:", contextError);
				setSessionsError(contextError instanceof Error ? contextError.message : "Failed to update session context");
			});
		},
		[activeSessionId, persistSessionContext],
	);

	useEffect(() => {
		if (contextSelectionMode === "manual") return;
		const nextSelection = contextSelectionMode === "current" ? [noteId] : availableNotes.map((note) => note.id);
		if (areSameIds(selectedNoteIdsRef.current, nextSelection)) return;
		updateSessionContext(nextSelection);
	}, [availableNotes, contextSelectionMode, noteId, updateSessionContext]);

	const handleSelectCurrentContext = useCallback(() => {
		setContextSelectionMode("current");
		updateSessionContext([noteId]);
	}, [noteId, updateSessionContext]);

	const handleSelectAllContext = useCallback(() => {
		setContextSelectionMode("all");
		updateSessionContext(availableNotes.map((note) => note.id));
	}, [availableNotes, updateSessionContext]);

	const toggleContextNote = (targetNoteId: string) => {
		setContextSelectionMode("manual");
		updateSessionContext(
			selectedNoteIdsRef.current.includes(targetNoteId)
				? selectedNoteIdsRef.current.filter((contextNoteId) => contextNoteId !== targetNoteId)
				: [...selectedNoteIdsRef.current, targetNoteId],
		);
	};

	const handleSelectSession = useCallback(
		async (sessionId: string) => {
			if (sessionId === activeSessionId) return;
			setActiveSessionId(sessionId);
			writeStoredActiveSessionId(workspaceId, sessionId);
			setIsChatHistoryOpen(false);
		},
		[activeSessionId, workspaceId],
	);

	const handleCreateSession = useCallback(async () => {
		await createSession(selectedNoteIds.length > 0 ? selectedNoteIds : [noteId], noteTitle);
		setIsChatHistoryOpen(false);
	}, [createSession, noteId, noteTitle, selectedNoteIds]);

	const handleRequestDeleteSession = useCallback((session: ChatSessionSummary) => {
		setSessionPendingDeletion(session);
	}, []);

	const handleConfirmDeleteSession = useCallback(async () => {
		if (!sessionPendingDeletion || isDeletingSession) return;
		const sessionId = sessionPendingDeletion.id;
		const wasActiveSession = sessionId === activeSessionId;
		const nextSessionAfterDeletion = sessions.filter((session) => session.id !== sessionId);
		setIsDeletingSession(true);
		setSessionsError(null);
		try {
			const response = await fetch(`/api/ai/sessions/${sessionId}`, { method: "DELETE" });
			if (!response.ok) throw new Error(await readErrorMessage(response, "Failed to delete chat session"));
			setSessions(nextSessionAfterDeletion);
			sessionStateCacheRef.current.delete(sessionId);
			if (wasActiveSession) {
				const nextSession = nextSessionAfterDeletion[0] ?? null;
				if (nextSession) {
					setActiveSessionId(nextSession.id);
					writeStoredActiveSessionId(workspaceId, nextSession.id);
				} else {
					setActiveSessionId(null);
					setMessages([]);
					messagesSessionIdRef.current = null;
				}
			}
			setSessionPendingDeletion(null);
		} catch (deleteError) {
			console.error("Failed to delete AI chat session:", deleteError);
			setSessionsError(deleteError instanceof Error ? deleteError.message : "Failed to delete chat session");
		} finally {
			setIsDeletingSession(false);
		}
	}, [activeSessionId, isDeletingSession, sessionPendingDeletion, sessions, workspaceId]);

	const handleFlashcardsGenerated = useCallback(
		(deck: FlashcardDeckPayload) => {
			const assistantMessage: Message = {
				id: `assistant-flashcards-${Date.now()}`,
				role: "assistant",
				content: `Generated ${deck.count} flashcards for ${deck.title}.`,
				timestamp: new Date(),
				model,
				flashcardDeck: deck,
			};
			setMessages((previousMessages) => [...previousMessages, assistantMessage]);
			notifyAiUsageChanged();
		},
		[model],
	);

	const handleOpenFlashcardDialog = useCallback(async () => {
		if (isConversationLocked) return;

		try {
			if (!activeSessionId) {
				const createdSession = await createSession(selectedNoteIds.length > 0 ? selectedNoteIds : [noteId], noteTitle);
				messagesSessionIdRef.current = createdSession.id;
			}
			setIsFlashcardDialogOpen(true);
		} catch (sessionError) {
			setError(sessionError instanceof Error ? sessionError.message : "Failed to prepare flashcard session");
		}
	}, [activeSessionId, createSession, isConversationLocked, noteId, noteTitle, selectedNoteIds]);

	const handleSubmit = useCallback(
		async (prompt?: string) => {
			const content = prompt || input;
			if (!content.trim() || isConversationLocked) return;
			suppressSessionHydrationRef.current = true;
			let sessionIdToUse = activeSessionId;
			if (!sessionIdToUse) {
				const createdSession = await createSession(selectedNoteIds.length > 0 ? selectedNoteIds : [noteId], noteTitle);
				sessionIdToUse = createdSession.id;
				messagesSessionIdRef.current = createdSession.id;
			}
			setError(null);
			const userMessage: Message = { id: `user-${Date.now()}`, role: "user", content: content.trim(), timestamp: new Date() };
			setMessages((prev) => [...prev, userMessage]);
			setInput("");
			setIsLoading(true);
			const assistantId = `assistant-${Date.now()}`;
			const assistantMessage: Message = { id: assistantId, role: "assistant", content: "", timestamp: new Date(), model };
			setMessages((prev) => [...prev, assistantMessage]);
			try {
				const response = await fetch("/api/ai/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						message: content.trim(),
						sessionId: sessionIdToUse,
						noteId,
						noteTitle,
						noteContent,
						contextNoteIds: selectedNoteIds,
						model,
						source: "chat",
					}),
				});
				if (!response.ok) throw new Error(await readErrorMessage(response, "Failed to get response"));
				const reader = response.body?.getReader();
				const decoder = new TextDecoder();
				let fullContent = "";
				if (reader) {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						const chunk = decoder.decode(value);
						fullContent += chunk;
						setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, content: fullContent } : message)));
					}
				}
				notifyAiUsageChanged();
			} catch (submitError) {
				const errorMessage = submitError instanceof Error ? submitError.message : "Something went wrong";
				setError(errorMessage);
				setMessages((prev) => prev.filter((message) => message.id !== assistantId));
			} finally {
				suppressSessionHydrationRef.current = false;
				setIsLoading(false);
			}
		},
		[activeSessionId, createSession, input, isConversationLocked, model, noteContent, noteId, noteTitle, selectedNoteIds],
	);

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void handleSubmit();
		}
	};

	const isCurrentMode = contextSelectionMode === "current";
	const isAllMode = contextSelectionMode === "all";
	const isManualMode = contextSelectionMode === "manual";
	const isContextModeButtonDisabled = isConversationLocked;
	const baseViewClassName = `flex h-full min-h-0 flex-col`;

	return (
					<div
						className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l`}
						style={{ backgroundColor: "var(--bg-sidebar)", borderColor: "var(--border-default)" }}>
			<div className={baseViewClassName}>
				<div className="flex h-12 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="flex items-center gap-2">
						<Sparkles className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />
						<span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							AI Assistant
						</span>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => onClose()}
							aria-label="Close AI panel"
							className="sm:hidden rounded px-2 py-1 text-sm"
							style={{ color: "var(--text-secondary)" }}>
							Close
						</button>
						<button onClick={() => onClose()} className="rounded p-1.5">
							<X className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
						</button>
					</div>
				</div>

				<div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border-default)" }}>
					<ModelSelector value={model} onChange={setModel} />
					<UsageIndicator model={model} />
				</div>

				<div className="border-b px-3 py-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
								Chat Sessions
							</p>
							<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
								{activeSession ? activeSession.title : "Create or pick a session"}
							</p>
						</div>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => setIsChatHistoryOpen(true)}
								className="rounded border px-2 py-1 text-[11px] transition-colors hover:bg-[#1a1a1a]"
								style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
								History
							</button>
							<button
								type="button"
								onClick={() => void handleCreateSession()}
								disabled={isConversationLocked}
								className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
								style={{ color: "var(--text-secondary)" }}>
								<Plus className="h-3.5 w-3.5" />
								New
							</button>
						</div>
					</div>
				</div>

				<div className="border-b px-3 py-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="mb-2 flex items-center justify-between gap-3">
						<div className="min-w-0">
							<p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
								Note Access
							</p>
							<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
								{selectedCount === 0 ? "No notes selected" : `${selectedCount} note${selectedCount === 1 ? "" : "s"} selected`}
							</p>
						</div>
						<div className="flex items-center gap-1">
							<button
								onClick={handleSelectCurrentContext}
								disabled={isContextModeButtonDisabled}
								className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isCurrentMode ? "" : "hover:bg-[#1a1a1a]"}`}
								style={{
									color: isCurrentMode ? "var(--sn-accent)" : "var(--text-secondary)",
									borderColor: isCurrentMode ? "var(--sn-accent)" : "var(--border-default)",
									backgroundColor: isCurrentMode ? "rgba(124, 106, 255, 0.12)" : "transparent",
								}}
								type="button">
								Current
							</button>
							<button
								onClick={handleSelectAllContext}
								disabled={isContextModeButtonDisabled}
								className={`rounded border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${isAllMode ? "" : "hover:bg-[#1a1a1a]"}`}
								style={{
									color: isAllMode ? "var(--sn-accent)" : "var(--text-secondary)",
									borderColor: isAllMode ? "var(--sn-accent)" : "var(--border-default)",
									backgroundColor: isAllMode ? "rgba(124, 106, 255, 0.12)" : "transparent",
								}}
								type="button">
								All
							</button>
							<button
								ref={noteAccessTriggerRef}
								type="button"
								onClick={() => setIsNoteAccessOpen((previous) => !previous)}
								aria-expanded={isNoteAccessOpen}
								className={`rounded border px-2 py-1 text-[11px] transition-colors ${isNoteAccessOpen ? "" : "hover:bg-[#1a1a1a]"}`}
								style={{
									borderColor: isNoteAccessOpen ? "var(--sn-accent)" : "var(--border-default)",
									color: isNoteAccessOpen ? "var(--sn-accent)" : "var(--text-secondary)",
									backgroundColor: isNoteAccessOpen ? "rgba(124, 106, 255, 0.12)" : "transparent",
								}}>
								Browse
							</button>
						</div>
					</div>
					{isManualMode && (
						<p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
							Manual selection active.
						</p>
					)}
				</div>

				<Dialog
					open={Boolean(sessionPendingDeletion)}
					onOpenChange={(open) => {
						if (!open && !isDeletingSession) setSessionPendingDeletion(null);
					}}>
					<DialogContent showCloseButton={false} className="!top-1/2 !-translate-y-1/2 sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Delete conversation?</DialogTitle>
							<DialogDescription>
								This will permanently remove {sessionPendingDeletion?.title ?? "this conversation"} and its messages.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<button
								type="button"
								onClick={() => setSessionPendingDeletion(null)}
								disabled={isDeletingSession}
								className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
								style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => void handleConfirmDeleteSession()}
								disabled={isDeletingSession}
								className="rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
								style={{ backgroundColor: "#b91c1c", color: "white" }}>
								{isDeletingSession ? "Deleting..." : "Delete conversation"}
							</button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<div className="flex-1 overflow-y-auto p-3">
					{messages.length === 0 ? (
						<SuggestedPrompts onSelect={handleSubmit} noteTitle={noteTitle} />
					) : (
						<div className="space-y-3">
							{messages.map((message, index) => (
								<ChatMessage
									key={message.id}
									message={message}
									onAppendToNote={onAppendToNote}
									isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
								/>
							))}
						</div>
					)}
					{error && (
						<div className="mt-3 rounded-md p-3 text-sm" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>
							{error}
						</div>
					)}
					<div ref={messagesEndRef} />
				</div>

				<div className="border-t p-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="mb-2 flex items-center justify-between gap-2">
						<button
							type="button"
							onClick={() => void handleOpenFlashcardDialog()}
							disabled={isConversationLocked}
							className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8c8c8c] disabled:cursor-not-allowed disabled:opacity-50"
							style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
							<Layers className="h-3.5 w-3.5" />
							Flashcards
						</button>
					</div>
					<div className="flex gap-2">
						<textarea
							ref={inputRef}
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Ask AI anything..."
							rows={1}
							className="flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1"
							style={{ borderColor: "var(--border-default)", color: "var(--text-primary)", minHeight: "38px" }}
							disabled={isConversationLocked}
						/>
						<button
							onClick={() => void handleSubmit()}
							disabled={!input.trim() || isConversationLocked}
							className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-md transition-opacity disabled:opacity-40"
							style={{ backgroundColor: "var(--sn-accent)" }}>
							<Send className="h-4 w-4 text-white" />
						</button>
					</div>
					<p className="mt-2 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
						AI responses can make mistakes. Please double-check them.
					</p>
				</div>

				<GenerateFlashcardsDialogClient
					open={isFlashcardDialogOpen}
					onClose={() => setIsFlashcardDialogOpen(false)}
					onGenerated={handleFlashcardsGenerated}
					defaultText={defaultFlashcardSourceText}
					defaultTitle={noteTitle}
					noteId={noteId}
					sessionId={activeSessionId ?? undefined}
				/>
			</div>

			<div
				className={`absolute inset-0 z-30 flex flex-col bg-[var(--bg-sidebar)] ${isChatHistoryOpen ? "pointer-events-auto" : "hidden"}`}>
				<div className="flex h-12 shrink-0 items-center justify-between border-b px-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="flex min-w-0 items-center gap-2">
						<button
							type="button"
							onClick={() => setIsChatHistoryOpen(false)}
							className="rounded p-1.5 transition-colors hover:bg-[#1a1a1a]"
							aria-label="Back to chat">
							<ChevronLeft className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
						</button>
						<div className="min-w-0">
							<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
								Chat history
							</p>
							<p className="truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
								Browse past sessions or start a new thread
							</p>
						</div>
					</div>
					<button
						type="button"
						onClick={() => void handleCreateSession()}
						disabled={isConversationLocked}
						className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
						style={{ color: "var(--text-secondary)" }}>
						<Plus className="h-3.5 w-3.5" />
						New
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-3">
					{isSessionsLoading ? (
						<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
							Loading sessions...
						</p>
					) : sessions.length === 0 ? (
						<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
							No saved chats yet. Start the first thread here.
						</p>
					) : (
						<div className="space-y-2">
							{sessions.map((session) => {
								const isActive = session.id === activeSessionId;
								return (
									<div
										key={session.id}
										className={`flex items-stretch gap-1 rounded-md border p-1 transition-colors ${isActive ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"}`}
										style={{
											borderColor: isActive ? "var(--sn-accent)" : "var(--border-default)",
											backgroundColor: isActive ? "rgba(124, 106, 255, 0.08)" : "var(--bg-surface)",
										}}>
										<button
											type="button"
											onClick={() => void handleSelectSession(session.id)}
											disabled={isConversationLocked}
											className="min-w-0 flex-1 rounded-md px-2 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60">
											<div className="flex items-center justify-between gap-2">
												<span className="truncate text-xs font-medium" style={{ color: "var(--text-primary)" }}>
													{session.title}
												</span>
												<span className="shrink-0 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
													{session.messageCount} msg
												</span>
											</div>
										</button>
										<button
											type="button"
											onClick={() => handleRequestDeleteSession(session)}
											disabled={isConversationLocked}
											className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[#261a1a] disabled:cursor-not-allowed disabled:opacity-50"
											title={`Delete ${session.title}`}
											aria-label={`Delete ${session.title}`}>
											<Trash2 className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
										</button>
									</div>
								);
							})}
						</div>
					)}
					{sessionsError && (
						<p className="mt-2 text-[11px]" style={{ color: "#ef4444" }}>
							{sessionsError}
						</p>
					)}
				</div>
			</div>

			<div
				ref={noteAccessPopoverRef}
				className={`absolute left-3 right-3 top-[7.5rem] z-40 rounded-xl border bg-[var(--bg-sidebar)] shadow-[0_24px_60px_rgba(0,0,0,0.4)] ${isNoteAccessOpen ? "pointer-events-auto" : "hidden"}`}
				style={{ borderColor: "var(--border-default)" }}>
				<div className="border-b px-3 py-3" style={{ borderColor: "var(--border-default)" }}>
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
								Note Access
							</p>
							<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
								Select notes to shape the assistant context.
							</p>
						</div>
						<button
							type="button"
							onClick={() => setIsNoteAccessOpen(false)}
							className="rounded p-1.5 transition-colors hover:bg-[#1a1a1a]"
							aria-label="Close note access panel">
							<X className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
						</button>
					</div>
				</div>
				<div className="p-3">
					<div
						className="mb-2 flex items-center gap-2 rounded-md border px-2 py-2"
						style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
						<Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-tertiary)" }} />
						<input
							value={noteSearch}
							onChange={(event) => setNoteSearch(event.target.value)}
							placeholder="Filter accessible notes..."
							className="w-full bg-transparent text-xs outline-none"
							style={{ color: "var(--text-primary)" }}
							disabled={isConversationLocked}
						/>
					</div>
					<div
						className="max-h-[calc(100vh-18rem)] space-y-1 overflow-y-auto rounded-md border p-1"
						style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
						{notesLoading ? (
							<p className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
								Loading notes...
							</p>
						) : filteredNotes.length === 0 ? (
							<p className="px-2 py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
								No notes match this filter.
							</p>
						) : (
							filteredNotes.map((note) => {
								const isSelected = selectedNoteIds.includes(note.id);
								const isCurrentNote = note.id === noteId;
								return (
									<label
										key={note.id}
										className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-[#1a1a1a]">
										<input type="checkbox" checked={isSelected} onChange={() => toggleContextNote(note.id)} className="sr-only" />
										{isSelected ? (
											<CheckSquare className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--sn-accent)" }} />
										) : (
											<Square className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
										)}
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<span className="truncate text-xs font-medium" style={{ color: "var(--text-primary)" }}>
													{note.emoji ? `${note.emoji} ` : ""}
													{note.title}
												</span>
												{isCurrentNote && (
													<span
														className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
														style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
														Current
													</span>
												)}
											</div>
											<p className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
												{note.path}
											</p>
											{note.contentText && (
												<p className="truncate text-[11px]" style={{ color: "var(--text-tertiary)" }}>
													{note.contentText}
												</p>
											)}
										</div>
									</label>
								);
							})
						)}
					</div>
					{notesError && (
						<p className="mt-2 text-[11px]" style={{ color: "#ef4444" }}>
							{notesError}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
