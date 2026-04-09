"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { notifyAiUsageChanged } from "@/lib/ai-usage-events";

type ChatMode = "workspace" | "general";

interface HomeChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
}

const SUGGESTIONS = ["Summarize my recent notes", "What's due today?", "Help me study for Physics"] as const;
const MAX_VISIBLE_MESSAGES = 20;

function createMessageId() {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}

	return `home-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function trimHistoryForNextTurn(messages: HomeChatMessage[]) {
	if (messages.length <= MAX_VISIBLE_MESSAGES - 2) {
		return messages;
	}

	const overflow = messages.length - (MAX_VISIBLE_MESSAGES - 2);
	const removeCount = overflow % 2 === 0 ? overflow : overflow + 1;
	return messages.slice(removeCount);
}

export function HomeAiChat() {
	const [messages, setMessages] = useState<HomeChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<ChatMode>("workspace");
	const bottomRef = useRef<HTMLDivElement | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: isStreaming ? "auto" : "smooth" });
	}, [error, isStreaming, messages]);

	useEffect(() => {
		return () => {
			abortControllerRef.current?.abort();
		};
	}, []);

	async function submitPrompt(promptOverride?: string) {
		const nextPrompt = (promptOverride ?? input).trim();
		if (!nextPrompt || isStreaming) {
			return;
		}

		const requestMode = mode;
		const baseMessages = trimHistoryForNextTurn(messages);
		const userMessage: HomeChatMessage = {
			id: createMessageId(),
			role: "user",
			content: nextPrompt,
		};
		const assistantMessageId = createMessageId();

		setError(null);
		setInput("");
		setIsStreaming(true);
		setMessages([
			...baseMessages,
			userMessage,
			{
				id: assistantMessageId,
				role: "assistant",
				content: "",
			},
		]);

		const controller = new AbortController();
		abortControllerRef.current?.abort();
		abortControllerRef.current = controller;

		try {
			const response = await fetch("/api/ai/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messages: [...baseMessages, userMessage].map(({ role, content }) => ({ role, content })),
					contextMode: requestMode,
					source: "home",
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				setMessages((currentMessages) => currentMessages.filter((message) => message.id !== assistantMessageId));
				setError(response.status === 429 ? "Daily AI quota reached. Resets tomorrow." : "Something went wrong. Try again.");
				return;
			}

			if (!response.body) {
				throw new Error("Missing response body");
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let fullContent = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				fullContent += decoder.decode(value, { stream: true });
				setMessages((currentMessages) =>
					currentMessages.map((message) =>
						message.id === assistantMessageId
							? {
									...message,
									content: fullContent,
								}
							: message,
					),
				);
			}

			fullContent += decoder.decode();
			setMessages((currentMessages) =>
				currentMessages.map((message) =>
					message.id === assistantMessageId
						? {
								...message,
								content: fullContent,
							}
						: message,
				),
			);

			notifyAiUsageChanged();
		} catch (fetchError) {
			if ((fetchError as Error).name === "AbortError") {
				return;
			}

			setMessages((currentMessages) => currentMessages.filter((message) => message.id !== assistantMessageId));
			setError("Something went wrong. Try again.");
		} finally {
			abortControllerRef.current = null;
			setIsStreaming(false);
		}
	}

	return (
		<section className="rounded-2xl border border-[#1e1e1e] border-t-[1.5px] border-t-[#7c6aff]/30 bg-[#111111] p-5 transition-all duration-200 hover:shadow-[0_0_0_1px_rgba(124,106,255,0.1)] md:col-span-3">
			<div className="flex flex-col gap-3 border-b border-[#1e1e1e] pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-[#555555]">✦ Sage</p>
					<span className="rounded-full bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] text-[#333333]">Home</span>
				</div>

				<div className="inline-flex rounded-full bg-[#0f0f0f] p-1">
					<button
						type="button"
						onClick={() => setMode("workspace")}
						className={`rounded-full px-3 py-1.5 text-xs transition-all duration-200 ${
							mode === "workspace" ? "border border-[#7c6aff]/30 bg-[#7c6aff]/15 text-[#7c6aff]" : "bg-[#1a1a1a] text-[#555555]"
						}`}>
						📄 This workspace
					</button>
					<button
						type="button"
						onClick={() => setMode("general")}
						className={`rounded-full px-3 py-1.5 text-xs transition-all duration-200 ${
							mode === "general" ? "border border-[#7c6aff]/30 bg-[#7c6aff]/15 text-[#7c6aff]" : "bg-[#1a1a1a] text-[#555555]"
						}`}>
						💬 General
					</button>
				</div>
			</div>

			<div className="mt-4 flex flex-col">
				<div className="custom-scrollbar max-h-[320px] overflow-y-auto pr-1">
					{messages.length === 0 ? (
						<div className="flex min-h-[220px] flex-col items-center justify-center px-4 text-center">
							<p className="text-sm text-[#555555]">✦ Ask Sage anything about your notes or studies.</p>
							<div className="mt-4 flex flex-wrap justify-center gap-2">
								{SUGGESTIONS.map((suggestion) => (
									<button
										key={suggestion}
										type="button"
										onClick={() => void submitPrompt(suggestion)}
										className="rounded-full border border-[#222222] bg-[#1a1a1a] px-3 py-1.5 text-xs text-[#888888] transition-all duration-200 hover:border-[#7c6aff]/40 hover:text-[#c4bbff]">
										{suggestion}
									</button>
								))}
							</div>
						</div>
					) : (
						<div className="space-y-4">
							{messages.map((message, index) =>
								message.role === "user" ? (
									<div key={message.id} className="flex justify-end">
										<div className="max-w-[75%] rounded-2xl rounded-br-sm bg-[#1a1a1a] px-4 py-2.5 text-sm text-[#f0f0f0]">
											<p className="whitespace-pre-wrap break-words">{message.content}</p>
										</div>
									</div>
								) : (
									<div key={message.id} className="max-w-[85%] text-sm text-[#c0c0c0]">
										<div className="flex items-start gap-2">
											<span className="mt-0.5 text-[#7c6aff]">✦</span>
											<p className="whitespace-pre-wrap break-words">
												{message.content}
												{isStreaming && index === messages.length - 1 ? <span className="ml-0.5 animate-pulse text-[#7c6aff]">|</span> : null}
											</p>
										</div>
									</div>
								),
							)}
						</div>
					)}

					{error ? <p className="mt-4 text-xs text-[#ef4444]">{error}</p> : null}
					<div ref={bottomRef} />
				</div>

				<div className="mt-4 border-t border-[#1e1e1e] pt-4">
					<div className="flex items-end gap-2">
						<textarea
							value={input}
							onChange={(event) => setInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									void submitPrompt();
								}
							}}
							placeholder="Ask Sage..."
							rows={1}
							className="min-h-[46px] flex-1 resize-none rounded-xl border border-[#222222] bg-[#1a1a1a] px-4 py-2.5 text-sm text-[#f0f0f0] outline-none transition-all duration-200 placeholder:text-[#444444] focus:border-[#7c6aff]/50 focus:shadow-[0_0_0_3px_rgba(124,106,255,0.08)]"
						/>
						<button
							type="button"
							onClick={() => void submitPrompt()}
							disabled={!input.trim() || isStreaming}
							className="rounded-lg bg-[#7c6aff] p-2.5 text-white transition-colors duration-200 hover:bg-[#7c6aff]/90 disabled:cursor-not-allowed disabled:opacity-50">
							<Send className="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
