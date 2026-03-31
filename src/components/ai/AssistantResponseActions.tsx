"use client";

import { useState } from "react";
import { Check, Clipboard, Plus } from "lucide-react";

interface AssistantResponseActionsProps {
	content: string;
	onAppendToNote?: (content: string) => boolean | void | Promise<boolean | void>;
	showAppendButton?: boolean;
	className?: string;
}

export function AssistantResponseActions({ content, onAppendToNote, showAppendButton = true, className }: AssistantResponseActionsProps) {
	const [copied, setCopied] = useState(false);
	const [appended, setAppended] = useState(false);

	const handleCopy = async () => {
		if (!content.trim()) {
			return;
		}

		await navigator.clipboard.writeText(content);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1500);
	};

	const handleAppend = async () => {
		if (!content.trim() || !onAppendToNote) {
			return;
		}

		const didAppend = await onAppendToNote(content);
		if (didAppend === false) {
			return;
		}
		setAppended(true);
		window.setTimeout(() => setAppended(false), 1500);
	};

	return (
		<div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`.trim()}>
			<button
				type="button"
				onClick={() => void handleCopy()}
				disabled={!content.trim()}
				className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
				style={{ color: copied ? "#86efac" : "var(--sn-accent)" }}>
				{copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
				{copied ? "Copied" : "Copy to clipboard"}
			</button>

			{showAppendButton ? (
				<button
					type="button"
					onClick={() => void handleAppend()}
					disabled={!content.trim() || !onAppendToNote}
					className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-50"
					style={{ color: appended ? "#86efac" : "var(--sn-accent)" }}>
					{appended ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
					{appended ? "Appended" : "Append to note"}
				</button>
			) : null}
		</div>
	);
}
