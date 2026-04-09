"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { queuePendingAiPrompt } from "@/lib/pending-ai-prompt";

export function QuickAskBar({
	workspaceId,
	initialTargetNoteId,
}: {
	workspaceId: string;
	initialTargetNoteId: string | null;
}) {
	const router = useRouter();
	const [prompt, setPrompt] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt || isSubmitting) {
			return;
		}

		setIsSubmitting(true);
		try {
			let targetNoteId = initialTargetNoteId;

			if (!targetNoteId) {
				const response = await fetch("/api/notes", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ workspaceId }),
				});

				if (!response.ok) {
					throw new Error("Failed to create a scratch note");
				}

				const note = (await response.json()) as { id: string };
				targetNoteId = note.id;
			}

			queuePendingAiPrompt(targetNoteId, trimmedPrompt);
			startTransition(() => {
				router.push(`/note/${encodeURIComponent(targetNoteId)}`);
			});
			setPrompt("");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="rounded-[22px] border px-4 py-4 sm:rounded-[28px] sm:px-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<input
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void handleSubmit();
						}
					}}
					placeholder="Ask Sage anything..."
					className="h-12 flex-1 rounded-[18px] border bg-transparent px-4 text-sm outline-none"
					style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
				/>
				<button
					type="button"
					onClick={() => void handleSubmit()}
					disabled={!prompt.trim() || isSubmitting}
					className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[18px] px-5 text-sm font-medium transition-colors disabled:opacity-50 sm:w-auto"
					style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
					<SendHorizontal className="h-4 w-4" />
					{isSubmitting ? "Opening..." : "Send"}
				</button>
			</div>
		</div>
	);
}
