import Image from "next/image";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { buildFileAccessUrl } from "@/lib/file-url";
import { parseNoteCoverMeta } from "@/lib/note-cover";

interface RecentNote {
	id: string;
	title: string;
	emoji: string | null;
	updatedAt: string | Date;
	coverImage: string | null;
	coverImageMeta?: unknown;
}

interface RecentNotesCardProps {
	notes: RecentNote[];
}

const COVER_COLORS = ["#1e1a2e", "#1a2230", "#1e2a1e", "#2a1e1e", "#1c2630", "#2a2418", "#1d1d2b", "#1f2b26"] as const;

function getNoteCoverColor(id: string) {
	let hash = 0;
	for (let index = 0; index < id.length; index += 1) {
		hash = (hash * 31 + id.charCodeAt(index)) % COVER_COLORS.length;
	}

	return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

function resolveCoverImage(note: RecentNote) {
	const meta = parseNoteCoverMeta(note.coverImageMeta);
	if (meta?.source === "upload") {
		return buildFileAccessUrl(meta.fileId);
	}

	return note.coverImage;
}

function truncateWithDots(value: string, maxLength = 42) {
	if (value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function RecentNotesCard({ notes }: RecentNotesCardProps) {
	return (
		<section className="rounded-[24px] border border-white/5 bg-[#111111] p-5">
			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Recently Visited</p>
				<p className="text-sm text-zinc-400">Quick access to the notes you opened most recently.</p>
			</div>

			<div className="stacknote-scrollbar-hidden mt-5 flex flex-row gap-3 overflow-x-auto pb-2">
				{notes.length === 0 ? (
					<div className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-white/5 bg-[#141414] text-sm text-zinc-500">
						No recent notes yet.
					</div>
				) : (
					notes.map((note) => {
						const coverImage = resolveCoverImage(note);
							const noteTitle = note.title || "Untitled";

						return (
							<Link
								key={note.id}
								href={`/note/${note.id}`}
								className="h-36 w-40 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-[#141414] transition-colors hover:border-white/10 hover:bg-[#1a1a1a]">
								<div className="h-16 w-full overflow-hidden" style={{ backgroundColor: coverImage ? undefined : getNoteCoverColor(note.id) }}>
									{coverImage ? <Image src={coverImage} alt="" width={320} height={128} unoptimized className="h-full w-full object-cover" /> : null}
								</div>
								<div className="flex h-20 flex-col px-3 pb-3">
									<div className="-mt-4 ml-1 text-2xl leading-none">{note.emoji ?? "📝"}</div>
										<p className="mt-2 line-clamp-1 text-sm font-medium text-white">{truncateWithDots(noteTitle)}</p>
									<p className="mt-2 text-xs text-zinc-500">{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</p>
								</div>
							</Link>
						);
					})
				)}
			</div>
		</section>
	);
}
