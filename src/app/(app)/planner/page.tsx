"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExamCard } from "@/components/planner/ExamCard";
import { NewExamDialog } from "@/components/planner/NewExamDialog";
import { PlannerSkeleton } from "@/components/planner/PlannerSkeleton";
import { PlannerStudySession } from "@/components/planner/PlannerStudySession";
import { TodaysPlan } from "@/components/planner/TodaysPlan";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { Button } from "@/components/ui/button";
import { isPlannerStudySessionPayload, type PlannerStudySessionPayload } from "@/lib/planner-study-session";

interface NoteOption {
	id: string;
	title: string;
	excerpt: string | null;
	updatedAt: string;
}

interface ExamRecord {
	id: string;
	title: string;
	subject: string | null;
	examDate: string;
	noteIds: string[];
	dailyStudyMinutes: number;
	plannedQuestionCount: number;
}

interface TodaysPlanItem {
	id: string;
	examId: string;
	examTitle: string;
	questionCount: number;
	estimatedMinutes: number;
}

interface PlannerPayload {
	notes: NoteOption[];
	exams: ExamRecord[];
	todaysPlan: TodaysPlanItem[];
}

type ExamDialogState =
	| {
			mode: "create";
	  }
	| {
			mode: "edit";
			exam: ExamRecord;
	  };

function isPlannerPayload(value: unknown): value is PlannerPayload {
	if (!value || typeof value !== "object") {
		return false;
	}

	const candidate = value as Partial<PlannerPayload>;
	return Array.isArray(candidate.notes) && Array.isArray(candidate.exams) && Array.isArray(candidate.todaysPlan);
}

function getApiErrorMessage(value: unknown) {
	if (!value || typeof value !== "object") {
		return null;
	}

	const maybeError = (value as { error?: unknown }).error;
	return typeof maybeError === "string" && maybeError.trim().length > 0 ? maybeError : null;
}

function getExamIdFromResponse(value: unknown) {
	if (!value || typeof value !== "object") {
		return null;
	}

	if ("exam" in value && value.exam && typeof value.exam === "object" && "id" in value.exam && typeof value.exam.id === "string") {
		return value.exam.id;
	}

	return null;
}

function dayOffsetFromToday(examDate: string) {
	const examDateKey = examDate.slice(0, 10);
	const target = new Date(`${examDateKey}T00:00:00.000Z`);
	const now = new Date();
	const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
	return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function getExamDateBadge(examDate: string) {
	const offset = dayOffsetFromToday(examDate);
	if (offset === 0) {
		return "Today";
	}

	if (offset > 0) {
		return `${offset}d`;
	}

	return `${Math.abs(offset)}d ago`;
}

export default function PlannerPage() {
	const [payload, setPayload] = useState<PlannerPayload | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [examDialogState, setExamDialogState] = useState<ExamDialogState | null>(null);
	const [pendingDeletePlan, setPendingDeletePlan] = useState<{ examId: string; title: string } | null>(null);
	const [isDeletingPlan, setIsDeletingPlan] = useState(false);
	const [studyOverlay, setStudyOverlay] = useState<{ title: string; session: PlannerStudySessionPayload | null } | null>(null);
	const [isPastTestsOpen, setIsPastTestsOpen] = useState(false);

	const refreshPlanner = useCallback(async () => {
		setIsLoading(true);
		try {
			const response = await fetch("/api/planner", { cache: "no-store" });
			const responseBody = (await response.json().catch(() => null)) as unknown;

			if (!response.ok) {
				const apiErrorMessage = getApiErrorMessage(responseBody);
				throw new Error(apiErrorMessage ?? `Failed to load planner (${response.status})`);
			}

			if (!isPlannerPayload(responseBody)) {
				throw new Error("Planner returned an invalid payload");
			}

			setPayload(responseBody);
			setLoadError(null);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : "Failed to load planner");
			console.error(error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void refreshPlanner();
	}, [refreshPlanner]);

	async function regenerateExamPlan(examId: string) {
		const generateResponse = await fetch("/api/planner/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ examId }),
		});
		const generateResponseBody = (await generateResponse.json().catch(() => null)) as unknown;

		if (!generateResponse.ok) {
			const apiErrorMessage = getApiErrorMessage(generateResponseBody);
			throw new Error(apiErrorMessage ?? "Failed to generate study plan");
		}
	}

	async function handleSubmitExam(input: { title: string; subject?: string | null; examDate: string; noteIds: string[]; dailyStudyMinutes: number }) {
		setActionError(null);
		const isEdit = examDialogState?.mode === "edit";

		try {
			if (isEdit) {
				const updateResponse = await fetch("/api/planner", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						examId: examDialogState.exam.id,
						...input,
					}),
				});
				const updateResponseBody = (await updateResponse.json().catch(() => null)) as unknown;

				if (!updateResponse.ok) {
					const apiErrorMessage = getApiErrorMessage(updateResponseBody);
					throw new Error(apiErrorMessage ?? "Failed to update exam");
				}

				await regenerateExamPlan(examDialogState.exam.id);
				toast.success("Assessment updated");
				await refreshPlanner();
				return;
			}

			const createResponse = await fetch("/api/planner", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input),
			});
			const createResponseBody = (await createResponse.json().catch(() => null)) as unknown;

			if (!createResponse.ok) {
				const apiErrorMessage = getApiErrorMessage(createResponseBody);
				throw new Error(apiErrorMessage ?? "Failed to create exam");
			}

			const examId = getExamIdFromResponse(createResponseBody);
			if (!examId) {
				throw new Error("Planner returned an invalid exam response");
			}

			await regenerateExamPlan(examId);
			toast.success("Assessment created");
			await refreshPlanner();
		} catch (error) {
			const message = error instanceof Error ? error.message : isEdit ? "Failed to update assessment" : "Failed to create assessment";
			setActionError(message);
			toast.error(message);
			throw error;
		}
	}

	async function handleDeletePlan(examId: string) {
		try {
			setActionError(null);
			setIsDeletingPlan(true);
			const response = await fetch("/api/planner/generate", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ examId }),
			});
			const responseBody = (await response.json().catch(() => null)) as unknown;

			if (!response.ok) {
				const apiErrorMessage = getApiErrorMessage(responseBody);
				throw new Error(apiErrorMessage ?? "Failed to delete study plan");
			}

			setPendingDeletePlan(null);
			toast.success("Assessment deleted");
			await refreshPlanner();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to delete assessment";
			setActionError(message);
			toast.error(message);
			console.error(error);
		} finally {
			setIsDeletingPlan(false);
		}
	}

	async function startCombinedSession(items: Array<{ examId: string; questionCount: number }>) {
		const normalizedItems = items
			.map((item) => ({
				examId: item.examId.trim(),
				questionCount: Math.max(0, Math.round(item.questionCount)),
			}))
			.filter((item) => item.examId.length > 0 && item.questionCount > 0);

		if (normalizedItems.length === 0) {
			setActionError("There are no cards scheduled for this session yet.");
			return;
		}

		const sessionTitle =
			normalizedItems.length === 1
				? (payload?.exams.find((exam) => exam.id === normalizedItems?.[0]?.examId)?.title ?? "Planner Session")
				: "Today's Planner Session";

		try {
			setActionError(null);
			setStudyOverlay({
				title: sessionTitle,
				session: null,
			});

			const response = await fetch("/api/planner/session/start", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ items: normalizedItems }),
			});
			const responseBody = (await response.json().catch(() => null)) as unknown;

			if (!response.ok) {
				const apiErrorMessage = getApiErrorMessage(responseBody);
				throw new Error(apiErrorMessage ?? "Failed to start study session");
			}

			if (!isPlannerStudySessionPayload(responseBody)) {
				throw new Error("Study session returned an invalid payload");
			}

			setStudyOverlay({
				title: responseBody.title,
				session: responseBody,
			});
		} catch (error) {
			setStudyOverlay(null);
			setActionError(error instanceof Error ? error.message : "Failed to start study session");
			console.error(error);
		}
	}

	const exams = payload?.exams ?? [];
	const todaysPlan = payload?.todaysPlan ?? [];
	const todaysQuestionCountByExamId = todaysPlan.reduce<Map<string, number>>((map, item) => {
		const existingCount = map.get(item.examId) ?? 0;
		map.set(item.examId, existingCount + item.questionCount);
		return map;
	}, new Map());
	const todaysSessionItems = todaysPlan.map((item) => ({
		examId: item.examId,
		questionCount: item.questionCount,
	}));

	const { currentExams, pastExams } = useMemo(() => {
		const nextCurrentExams: ExamRecord[] = [];
		const nextPastExams: ExamRecord[] = [];

		for (const exam of exams) {
			if (dayOffsetFromToday(exam.examDate) < 0) {
				nextPastExams.push(exam);
				continue;
			}

			nextCurrentExams.push(exam);
		}

		nextPastExams.sort((left, right) => right.examDate.localeCompare(left.examDate));
		return {
			currentExams: nextCurrentExams,
			pastExams: nextPastExams,
		};
	}, [exams]);

	const mainContent =
		isLoading && !payload ? (
			<PlannerSkeleton />
		) : !payload && loadError ? (
			<div className="flex h-full min-w-0 items-center justify-center px-6 text-center" style={{ backgroundColor: "var(--bg-app)" }}>
				<div
					className="max-w-lg space-y-4 rounded-[24px] border px-6 py-6"
					style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
						Failed to load planner
					</p>
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						{loadError}
					</p>
					<Button type="button" onClick={() => void refreshPlanner()} className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
						Retry
					</Button>
				</div>
			</div>
		) : (
			<>
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-sm uppercase tracking-[0.28em]" style={{ color: "var(--text-tertiary)" }}>
							Planner
						</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
							Study Planner
						</h1>
					</div>
					<Button
						type="button"
						onClick={() => setExamDialogState({ mode: "create" })}
						className="bg-[var(--sn-accent)] text-white hover:bg-[#8f7fff]">
						+ New exam
					</Button>
				</div>

				{loadError ? (
					<div className="rounded-2xl border px-4 py-3" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<p className="text-sm" style={{ color: "var(--text-primary)" }}>
								Could not refresh planner data. Showing the last successful snapshot.
							</p>
							<Button
								type="button"
								variant="outline"
								onClick={() => void refreshPlanner()}
								className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
								Retry
							</Button>
						</div>
						<p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
							{loadError}
						</p>
					</div>
				) : null}

				{/* actionError is shown via toast notifications; inline message removed */}

				<div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
					<div className="space-y-6">
						<div className="grid gap-4 md:grid-cols-2">
							{currentExams.length === 0 ? (
								<div
									className="rounded-[24px] border p-6"
									style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
									<p className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
										No upcoming exams
									</p>
									<p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
										{pastExams.length > 0
											? "Your older assessments are tucked away below. Add a new exam or update a past one to bring it back into the active plan."
											: "Add your first exam, link the notes you want to study, and StackNote will generate a review plan."}
									</p>
								</div>
							) : (
								currentExams.map((exam) => {
									const examTodaysQuestionCount = todaysQuestionCountByExamId.get(exam.id) ?? 0;

									return (
										<ExamCard
											key={exam.id}
											title={exam.title}
											subject={exam.subject}
											examDate={exam.examDate}
											dateBadgeLabel={getExamDateBadge(exam.examDate)}
											noteCount={Array.isArray(exam.noteIds) ? exam.noteIds.length : 0}
											questionCount={exam.plannedQuestionCount}
											onStudyToday={() => void startCombinedSession([{ examId: exam.id, questionCount: examTodaysQuestionCount }])}
											onEdit={() => setExamDialogState({ mode: "edit", exam })}
											onDeletePlan={() => setPendingDeletePlan({ examId: exam.id, title: exam.title })}
											isStudyTodayDisabled={examTodaysQuestionCount === 0}
										/>
									);
								})
							)}
						</div>

						{pastExams.length > 0 ? (
							<section
								className="rounded-[24px] border p-4 sm:p-6"
								style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
								<button
									type="button"
									onClick={() => setIsPastTestsOpen((current) => !current)}
									className="flex w-full items-center justify-between gap-4 text-left">
									<div>
										<h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
											Past tests
										</h2>
										<p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
											Assessments older than today stay folded here so the active plan remains focused.
										</p>
									</div>
									<div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
										<span>{pastExams.length}</span>
										<ChevronDown className={`h-4 w-4 transition-transform ${isPastTestsOpen ? "rotate-180" : ""}`} />
									</div>
								</button>

								{isPastTestsOpen ? (
									<div className="mt-4 grid gap-4 md:grid-cols-2">
										{pastExams.map((exam) => {
											const examTodaysQuestionCount = todaysQuestionCountByExamId.get(exam.id) ?? 0;

											return (
												<ExamCard
													key={exam.id}
													title={exam.title}
													subject={exam.subject}
													examDate={exam.examDate}
													dateBadgeLabel={getExamDateBadge(exam.examDate)}
													noteCount={Array.isArray(exam.noteIds) ? exam.noteIds.length : 0}
													questionCount={exam.plannedQuestionCount}
													onStudyToday={() =>
														void startCombinedSession([{ examId: exam.id, questionCount: examTodaysQuestionCount }])
													}
													onEdit={() => setExamDialogState({ mode: "edit", exam })}
													onDeletePlan={() => setPendingDeletePlan({ examId: exam.id, title: exam.title })}
													isStudyTodayDisabled={examTodaysQuestionCount === 0}
													variant="past"
												/>
											);
										})}
									</div>
								) : null}
							</section>
						) : null}
					</div>

					<TodaysPlan items={todaysPlan} onStart={() => void startCombinedSession(todaysSessionItems)} />
				</div>
			</>
		);

	return (
		<div className="flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-[#0a0a0a]">
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 sm:px-6">
				<HomeTopBar title="Planner" />
				<div className="mx-auto flex min-h-0 w-full max-w-6xl flex-col gap-6 pb-16 pt-4 sm:pb-10 sm:pt-6">{mainContent}</div>
			</div>

			<NewExamDialog
				open={examDialogState !== null}
				mode={examDialogState?.mode ?? "create"}
				initialExam={examDialogState?.mode === "edit" ? examDialogState.exam : null}
				notes={payload?.notes ?? []}
				onClose={() => setExamDialogState(null)}
				onSubmit={handleSubmitExam}
			/>

			<Dialog
				open={Boolean(pendingDeletePlan)}
				onOpenChange={(nextOpen) => {
					if (!nextOpen && !isDeletingPlan) {
						setPendingDeletePlan(null);
					}
				}}>
				<DialogContent
					centered
					className="max-w-md border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)]"
					showCloseButton={false}>
					<DialogHeader>
						<DialogTitle>Delete evaluation plan?</DialogTitle>
						<DialogDescription className="text-[var(--text-secondary)]">
							This removes {pendingDeletePlan?.title ?? "this exam"} from your planner and clears its generated study schedule.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="border-[var(--border-default)] bg-[var(--bg-sidebar)]">
						<Button
							type="button"
							variant="outline"
							onClick={() => setPendingDeletePlan(null)}
							disabled={isDeletingPlan}
							className="border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={isDeletingPlan}
							onClick={() => {
								if (!pendingDeletePlan) {
									return;
								}

								void handleDeletePlan(pendingDeletePlan.examId);
							}}>
							{isDeletingPlan ? (
								<span className="inline-flex items-center gap-2">
									<Loader2 className="h-4 w-4 animate-spin" />
									Deleting...
								</span>
							) : (
								"Delete plan"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{studyOverlay ? (
				<PlannerStudySession
					open
					loading={studyOverlay.session === null}
					title={studyOverlay.title}
					session={studyOverlay.session}
					onClose={() => {
						setStudyOverlay(null);
						void refreshPlanner();
					}}
				/>
			) : null}
		</div>
	);
}
