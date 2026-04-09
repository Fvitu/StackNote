import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileText } from "lucide-react";

type RecentNote = {
	id: string;
	title: string;
	emoji: string | null;
	updatedAt: string | Date;
};

export function RecentNotes({ notes }: { notes: RecentNote[] }) {
	return (
		<div className="rounded-[20px] border p-4 sm:rounded-[24px] sm:p-5" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
			<div className="mb-4">
				<h2 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
					Recent Notes
				</h2>
			</div>

			<div className="space-y-2">
				{notes.length === 0 ? (
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						No recent notes yet.
					</p>
				) : (
					notes.map((note) => (
						<Link
							key={note.id}
							href={`/note/${note.id}`}
							prefetch
								className="flex min-w-0 items-center gap-3 rounded-[18px] px-3 py-2 transition-colors hover:bg-[var(--bg-hover)]">
								<div className="flex min-w-0 flex-1 items-center gap-3">
								{note.emoji ? (
									<span className="text-base leading-none">{note.emoji}</span>
								) : (
									<FileText className="h-4 w-4 shrink-0" style={{ color: "var(--text-tertiary)" }} />
								)}
								<span className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
									{note.title || "Untitled"}
								</span>
							</div>
								<span className="hidden shrink-0 text-xs sm:inline" style={{ color: "var(--text-tertiary)" }}>
								{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
							</span>
						</Link>
					))
				)}
			</div>
		</div>
	);
}
