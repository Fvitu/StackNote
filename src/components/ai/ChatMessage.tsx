"use client";

import { memo } from "react";
import { User, Sparkles } from "lucide-react";
import { AssistantContent } from "./AssistantContent";
import { AssistantResponseActions } from "./AssistantResponseActions";
import { FlashcardChatMessage } from "@/components/flashcards/FlashcardChatMessage";
import { QuizChatMessage } from "./QuizChatMessage";
import type { FlashcardDeckPayload } from "@/components/flashcards/types";
import { TEXT_MODELS } from "@/lib/groq-models";
import { parseAssistantResponseContent } from "@/lib/ai-response";
import type { QuizHistoryPayload } from "@/lib/quiz";

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	model?: string;
	ragCount?: number;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
	flashcardDeck?: FlashcardDeckPayload;
	quizHistory?: QuizHistoryPayload;
}

interface ChatMessageProps {
	message: Message;
	isStreaming?: boolean;
	onAppendToNote?: (markdown: string) => boolean;
	onOpenQuiz?: (questions: QuizHistoryPayload["questions"]) => void;
}

export const ChatMessage = memo(function ChatMessage({ message, isStreaming, onAppendToNote, onOpenQuiz }: ChatMessageProps) {
	const isUser = message.role === "user";
	const hasFlashcardDeck = message.role === "assistant" && Boolean(message.flashcardDeck);
	const hasQuizHistory = message.role === "assistant" && Boolean(message.quizHistory);
	const parsedAssistantContent = !isUser ? parseAssistantResponseContent(message.content) : null;
	const visibleAssistantContent = !isUser ? (parsedAssistantContent?.finalContent ?? message.content) : "";
	const finalAssistantContent = !isUser ? visibleAssistantContent.trim() : "";

	return (
		<div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
			{/* Avatar */}
			<div
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
				style={{
					backgroundColor: isUser ? "var(--bg-active)" : "var(--sn-accent)",
				}}>
				{isUser ? <User className="h-3.5 w-3.5" style={{ color: "var(--text-secondary)" }} /> : <Sparkles className="h-3.5 w-3.5 text-white" />}
			</div>

			{/* Message body */}
			{hasFlashcardDeck ? (
				<div className="min-w-0 max-w-[95%] flex-1">
					<FlashcardChatMessage deck={message.flashcardDeck!} />
				</div>
			) : hasQuizHistory ? (
				<div className="min-w-0 max-w-[95%] flex-1">
					<QuizChatMessage quiz={message.quizHistory!} onStartQuiz={onOpenQuiz} />
				</div>
			) : (
				<div
					className={`min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser ? "rounded-br-sm" : "rounded-bl-sm"}`}
					style={{
						backgroundColor: isUser ? "var(--bg-active)" : "var(--bg-surface)",
						color: "var(--text-primary)",
					}}>
					{isUser ? (
						<div>
							<p className="whitespace-pre-wrap">{message.content}</p>
							{message.ragCount && message.ragCount > 0 ? (
								<p className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
									↗ Searched {message.ragCount} related note{message.ragCount === 1 ? "" : "s"}
								</p>
							) : null}
						</div>
					) : (
						<div className="ai-message-content min-w-0">
							{message.content ? (
								<>
									<AssistantContent content={visibleAssistantContent} isStreaming={isStreaming} />
									{!isStreaming && finalAssistantContent ? (
										<AssistantResponseActions content={finalAssistantContent} onAppendToNote={onAppendToNote} className="mt-3" />
									) : null}
									{!isStreaming && (
										<div
											className="mt-1 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] text-center"
											style={{ color: "var(--text-tertiary)", opacity: 0.55 }}>
											{(() => {
												const modelDisplay = message.model
													? (TEXT_MODELS.find((m) => m.id === message.model)?.name ?? message.model)
													: null;
												const ts = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp);
												const usage = parsedAssistantContent?.usage ?? message.usage ?? null;
												const footerItems = [
													ts.toLocaleString(),
													`Answered by ${modelDisplay ?? "AI model"}`,
													usage
														? `Tokens ↑: ${usage.inputTokens.toLocaleString()} · ↓: ${usage.outputTokens.toLocaleString()}`
														: null,
												].filter((item): item is string => Boolean(item));

												return footerItems.map((item, index) => (
													<div key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5 whitespace-normal">
														{index > 0 ? (
															<span aria-hidden="true" className="shrink-0">
																•
															</span>
														) : null}
														<span className="min-w-0">{item}</span>
													</div>
												));
											})()}
										</div>
									)}
								</>
							) : isStreaming ? (
								<span className="typing-indicator">
									<span className="dot" />
									<span className="dot" />
									<span className="dot" />
								</span>
							) : null}
							{isStreaming && message.content && (
								<span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse" style={{ backgroundColor: "var(--sn-accent)" }} />
							)}
						</div>
					)}
				</div>
			)}

			<style jsx>{`
				.typing-indicator {
					display: inline-flex;
					gap: 3px;
					align-items: center;
					padding: 4px 0;
				}

				.typing-indicator .dot {
					width: 6px;
					height: 6px;
					background-color: var(--text-tertiary);
					border-radius: 50%;
					animation: typing 1.4s infinite ease-in-out both;
				}

				.typing-indicator .dot:nth-child(1) {
					animation-delay: 0s;
				}

				.typing-indicator .dot:nth-child(2) {
					animation-delay: 0.2s;
				}

				.typing-indicator .dot:nth-child(3) {
					animation-delay: 0.4s;
				}

				@keyframes typing {
					0%,
					80%,
					100% {
						transform: scale(0.6);
						opacity: 0.4;
					}
					40% {
						transform: scale(1);
						opacity: 1;
					}
				}
			`}</style>
		</div>
	);
});
