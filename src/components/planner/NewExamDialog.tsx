"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface NoteOption {
	id: string;
	title: string;
	excerpt: string | null;
	updatedAt: string;
}

interface NewExamDialogProps {
	open: boolean;
	notes: NoteOption[];
	onClose: () => void;
	onCreate: (payload: { title: string; subject?: string; examDate: string; noteIds: string[]; dailyStudyMinutes: number }) => Promise<void>;
}

export function NewExamDialog({ open, notes, onClose, onCreate }: NewExamDialogProps) {
	const [title, setTitle] = useState("");
	const [subject, setSubject] = useState("");
	const [examDate, setExamDate] = useState("");
	const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
	const [dailyStudyMinutes, setDailyStudyMinutes] = useState(20);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const minExamDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

	useEffect(() => {
		if (!open) {
			return;
		}

		setTitle("");
		setSubject("");
		setExamDate("");
		setSelectedNoteIds([]);
		setDailyStudyMinutes(20);
		setIsSubmitting(false);
		setSubmitError(null);
	}, [open]);

	const canSubmit = useMemo(() => title.trim().length > 0 && examDate && selectedNoteIds.length > 0, [examDate, selectedNoteIds, title]);

	async function handleSubmit() {
		if (!canSubmit || isSubmitting) {
			return;
		}

		setIsSubmitting(true);
		setSubmitError(null);

		try {
			await onCreate({
				title: title.trim(),
				subject: subject.trim() || undefined,
				examDate,
				noteIds: selectedNoteIds,
				dailyStudyMinutes,
			});
			onClose();
		} catch (error) {
			setSubmitError(error instanceof Error ? error.message : "Failed to create exam");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onClose() : null)}>
			<DialogContent className="!top-1/2 !left-1/2 !w-[calc(100vw-1rem)] !max-w-[min(42rem,calc(100vw-1rem))] !max-h-[calc(100dvh-1rem)] !-translate-x-1/2 !-translate-y-1/2 border-[var(--border-default)] bg-[var(--bg-sidebar)] p-0 text-[var(--text-primary)]">
				<DialogHeader className="border-b px-4 py-4 sm:px-6 sm:py-5" style={{ borderColor: "var(--border-default)" }}>
					<DialogTitle>New exam</DialogTitle>
					<DialogDescription className="text-[var(--text-secondary)]">
						Link your notes, pick the exam date, and let StackNote create day-by-day question sessions from that material.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
					<div className="grid gap-4 md:grid-cols-2">
						<label className="space-y-2 text-sm">
							<span style={{ color: "var(--text-secondary)" }}>Exam title</span>
							<input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
								style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
								placeholder="Physics Final"
							/>
						</label>
						<label className="space-y-2 text-sm">
							<span style={{ color: "var(--text-secondary)" }}>Subject</span>
							<input
								value={subject}
								onChange={(event) => setSubject(event.target.value)}
								className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
								style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
								placeholder="Mechanics"
							/>
						</label>
					</div>

					<label className="space-y-2 text-sm">
						<span style={{ color: "var(--text-secondary)" }}>Exam date</span>
						<input
							type="date"
							value={examDate}
							onChange={(event) => setExamDate(event.target.value)}
							min={minExamDate}
							className="h-11 w-full rounded-xl border bg-[var(--bg-surface)] px-3 outline-none"
							style={{ borderColor: "var(--border-default)", color: "var(--text-primary)" }}
						/>
					</label>

					<div className="space-y-2 text-sm">
						<p style={{ color: "var(--text-secondary)" }}>Linked notes</p>
						<div className="grid max-h-80 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
							{notes.map((note) => {
								const isSelected = selectedNoteIds.includes(note.id);
								return (
									<button
										key={note.id}
										type="button"
										onClick={() =>
											setSelectedNoteIds((previousIds) =>
												previousIds.includes(note.id) ? previousIds.filter((id) => id !== note.id) : [...previousIds, note.id],
											)
										}
										className="rounded-2xl border px-4 py-3 text-left transition-colors"
										style={{
											borderColor: isSelected ? "var(--sn-accent)" : "var(--border-default)",
											backgroundColor: isSelected ? "var(--accent-muted)" : "var(--bg-surface)",
										}}>
										<p className="font-medium" style={{ color: "var(--text-primary)" }}>
											{note.title}
										</p>
										<p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
											{note.excerpt?.trim() ? note.excerpt : "No extracted preview yet."}
										</p>
										<p className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
											Updated {new Date(note.updatedAt).toLocaleDateString()}
										</p>
									</button>
								);
							})}
						</div>
					</div>

					{submitError ? (
						<p
							className="rounded-xl border px-3 py-2 text-sm"
							style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}>
							{submitError}
						</p>
					) : null}

					<div className="space-y-3 rounded-2xl border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
									Daily study goal
								</p>
								<p className="text-xs" style={{ color: "var(--text-secondary)" }}>
									StackNote turns this into a daily question budget based on the linked notes.
								</p>
							</div>
							<span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
								{dailyStudyMinutes} min
							</span>
						</div>
						<input
							type="range"
							min={10}
							max={60}
							step={5}
							value={dailyStudyMinutes}
							onChange={(event) => setDailyStudyMinutes(Number(event.target.value))}
							className="w-full"
							style={{ accentColor: "var(--sn-accent)" }}
						/>
					</div>

					<div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							className="w-full border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] sm:w-auto">
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => void handleSubmit()}
							disabled={!canSubmit || isSubmitting}
							className="w-full bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff] sm:w-auto">
							{isSubmitting ? "Creating..." : "Create exam"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
