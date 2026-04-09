"use client";

import { memo, useMemo, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";
import { parseAssistantContent } from "@/lib/ai-response";
import { cn } from "@/lib/utils";

interface AssistantContentProps {
	content: string;
	isStreaming?: boolean;
	className?: string;
}

interface ReasoningDetailsProps {
	reasoning: string;
	defaultOpen: boolean;
	isStreaming: boolean;
}

function ReasoningDetails({ reasoning, defaultOpen, isStreaming }: ReasoningDetailsProps) {
	const [isReasoningOpen, setIsReasoningOpen] = useState(defaultOpen);

	return (
		<details
			className="stacknote-ai-thought rounded-xl p-3"
			open={isReasoningOpen}
			onToggle={(event) => {
				setIsReasoningOpen((event.currentTarget as HTMLDetailsElement).open);
			}}>
			<summary className="flex cursor-pointer items-center justify-between gap-3">
				<span className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
					<Brain className="h-3.5 w-3.5" style={{ color: "var(--sn-accent)" }} />
					{isStreaming ? "Thinking" : "Thought process"}
				</span>
				<ChevronDown className={`h-4 w-4 transition-transform ${isReasoningOpen ? "rotate-180" : ""}`} style={{ color: "var(--text-tertiary)" }} />
			</summary>
			<div className="mt-3 text-sm" style={{ color: "var(--text-primary)" }}>
				<MarkdownContent content={reasoning} />
			</div>
		</details>
	);
}

export const AssistantContent = memo(function AssistantContent({ content, isStreaming = false, className }: AssistantContentProps) {
	const parsed = useMemo(() => parseAssistantContent(content), [content]);
	const reasoningDefaultOpen = parsed.hasReasoning && (isStreaming || !parsed.reasoningComplete);
	const reasoningKey = `${parsed.reasoning}::${reasoningDefaultOpen ? "open" : "closed"}`;

	return (
		<div className={cn("space-y-3", className)}>
			{parsed.hasReasoning && (
				<ReasoningDetails key={reasoningKey} reasoning={parsed.reasoning} defaultOpen={reasoningDefaultOpen} isStreaming={isStreaming} />
			)}

			{parsed.finalContent ? (
				<MarkdownContent content={parsed.finalContent} />
			) : parsed.hasReasoning && isStreaming ? (
				<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
					Waiting for final answer...
				</p>
			) : null}
		</div>
	);
});
