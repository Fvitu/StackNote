import { differenceInCalendarDays } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAiUsage, getCurrentWorkspace, getUserSettings } from "@/lib/server-data";
import { AiQuotaCard } from "@/components/home/AiQuotaCard";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeTopBar } from "@/components/home/HomeTopBar";
import { HomeDashboardColumns } from "@/components/home/HomeDashboardColumns";
import { RecentNotesCard } from "@/components/home/RecentNotesCard";
import { StudySessionCard } from "@/components/home/StudySessionCard";
import { UpcomingExamsCard } from "@/components/home/UpcomingExamsCard";
import type { HomeFileMediaType, HomeFileTree, HomeFolderItem, HomeNoteItem } from "@/components/home/file-manager-types";
import { HomeFileExplorer } from "@/components/home/HomeFileExplorer";

function formatCompactNumber(value: number) {
	return new Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function serializeDate(value: Date, context: string) {
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		console.warn(`[home] Skipping ${context} with invalid date value`);
		return null;
	}

	return value.toISOString();
}

function getHomeStatusLine(
	todayQuestionCount: number,
	exams: Array<{
		title: string;
		subject: string | null;
		examDate: string;
	}>,
) {
	if (todayQuestionCount > 0) {
		return `You have ${todayQuestionCount} planner question${todayQuestionCount === 1 ? "" : "s"} scheduled today.`;
	}

	const nextExam = exams[0];
	if (!nextExam) {
		return "No exams this week. Your dashboard is clear.";
	}

	const remainingDays = differenceInCalendarDays(new Date(nextExam.examDate), new Date());
	const label = nextExam.subject?.trim() || nextExam.title;

	if (remainingDays < 0) {
		return `${label} is overdue. Review the planner.`;
	}

	if (remainingDays === 0) {
		return `${label} is scheduled for today.`;
	}

	if (remainingDays === 1) {
		return `${label} is tomorrow.`;
	}

	if (remainingDays <= 7) {
		return `${label} is in ${remainingDays} days.`;
	}

	return "No exams this week. Stay ahead.";
}

function buildHomeFileTree(
	folders: Array<{
		id: string;
		name: string;
		parentId: string | null;
		order: number;
		updatedAt: Date;
	}>,
	notes: Array<{
		id: string;
		title: string;
		emoji: string | null;
		folderId: string | null;
		order: number;
		updatedAt: Date;
		files: Array<{
			id: string;
			noteId: string;
			name: string;
			type: string;
			mimeType: string;
			createdAt: Date;
		}>;
	}>,
): HomeFileTree {
	const folderMap = new Map<string, HomeFolderItem>();

	for (const folder of folders) {
		const updatedAt = serializeDate(folder.updatedAt, `folder ${folder.id}`);
		if (!updatedAt) {
			continue;
		}

		folderMap.set(folder.id, {
			id: folder.id,
			name: folder.name,
			parentId: folder.parentId,
			order: folder.order,
			updatedAt,
			children: [],
			notes: [],
		});
	}

	const rootNotes: HomeNoteItem[] = [];
	for (const note of notes) {
		const updatedAt = serializeDate(note.updatedAt, `note ${note.id}`);
		if (!updatedAt) {
			continue;
		}

		const files = note.files.flatMap((file) => {
			const createdAt = serializeDate(file.createdAt, `file ${file.id}`);
			if (!createdAt) {
				return [];
			}

			return [
				{
					id: file.id,
					noteId: file.noteId,
					name: file.name,
					mediaType: file.type as HomeFileMediaType,
					mimeType: file.mimeType,
					createdAt,
				},
			];
		});

		const homeNote: HomeNoteItem = {
			id: note.id,
			title: note.title,
			emoji: note.emoji,
			folderId: note.folderId,
			order: note.order,
			updatedAt,
			files,
		};

		if (note.folderId && folderMap.has(note.folderId)) {
			folderMap.get(note.folderId)?.notes.push(homeNote);
			continue;
		}

		rootNotes.push(homeNote);
	}

	const rootFolders: HomeFolderItem[] = [];
	for (const folder of folders) {
		const currentFolder = folderMap.get(folder.id);
		if (!currentFolder) {
			continue;
		}

		if (folder.parentId && folderMap.has(folder.parentId)) {
			folderMap.get(folder.parentId)?.children.push(currentFolder);
			continue;
		}

		rootFolders.push(currentFolder);
	}

	return {
		folders: rootFolders,
		rootNotes,
	};
}

export default async function AppPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	const session = await auth();
	if (!session?.user?.id) {
		return null;
	}

	const params = await searchParams;
	const requestedFolderId = typeof params.folder === "string" ? params.folder : null;
	const userId = session.user.id;
	const workspace = await getCurrentWorkspace(userId);
	const todayKey = new Date().toISOString().slice(0, 10);
	const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);

	if (!workspace) {
		return null;
	}

	const [folders, notes, aiUsage, settings, recentNotes, exams, todaysPlan] = await Promise.all([
		prisma.folder.findMany({
			where: { workspaceId: workspace.id },
			orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
			select: {
				id: true,
				name: true,
				parentId: true,
				order: true,
				updatedAt: true,
			},
		}),
		prisma.note.findMany({
			where: {
				workspaceId: workspace.id,
				isArchived: false,
			},
			orderBy: [{ order: "asc" }, { updatedAt: "desc" }],
			select: {
				id: true,
				title: true,
				emoji: true,
				folderId: true,
				order: true,
				updatedAt: true,
				files: {
					orderBy: {
						createdAt: "desc",
					},
					select: {
						id: true,
						noteId: true,
						name: true,
						type: true,
						mimeType: true,
						createdAt: true,
					},
				},
			},
		}),
		getAiUsage(userId),
		getUserSettings(userId),
		prisma.note.findMany({
			where: {
				isArchived: false,
				workspace: {
					userId,
				},
			},
			orderBy: {
				updatedAt: "desc",
			},
			take: 6,
			select: {
				id: true,
				title: true,
				emoji: true,
				coverImage: true,
				coverImageMeta: true,
				updatedAt: true,
			},
		}),
		prisma.exam.findMany({
			where: {
				userId,
				isCompleted: false,
				examDate: {
					gte: todayUtc,
				},
			},
			orderBy: {
				examDate: "asc",
			},
			take: 2,
			select: {
				id: true,
				title: true,
				subject: true,
				examDate: true,
			},
		}),
		prisma.studyPlanDay.findMany({
			where: {
				date: todayKey,
				exam: {
					userId,
					isCompleted: false,
					examDate: {
						gte: todayUtc,
					},
				},
			},
			select: {
				questionCount: true,
				estimatedMinutes: true,
			},
		}),
	]);

	const fileTree = buildHomeFileTree(folders, notes);
	const preferredTextUsage = aiUsage.textModels.find((model) => model.model === settings.preferredTextModel) ?? aiUsage.textModels[0];
	const preferredVoiceUsage = aiUsage.voiceModels.find((model) => model.model === settings.preferredSttModel) ?? aiUsage.voiceModels[0];
	const totalPlannedQuestionsToday = todaysPlan.reduce((sum, item) => sum + item.questionCount, 0);
	const totalMinutesToday = todaysPlan.reduce((sum, item) => sum + item.estimatedMinutes, 0);
	const estimatedSessionMinutes = totalMinutesToday;
	const currentYear = new Date().getFullYear();
	const serializedExams = exams
		.map((exam) => ({
			id: exam.id,
			title: exam.title,
			subject: exam.subject,
			examDate: serializeDate(exam.examDate, `exam ${exam.id}`),
		}))
		.filter((exam): exam is { id: string; title: string; subject: string | null; examDate: string } => exam.examDate !== null);
	const statusLine = getHomeStatusLine(totalPlannedQuestionsToday, serializedExams);

	return (
		<div className="flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-[#0a0a0a]">
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pt-4 sm:px-6 sm:pt-6">
				<HomeTopBar />
				<div className="mx-auto flex min-w-0 w-full max-w-[1440px] flex-col gap-6 pb-16 pt-4 sm:pb-10 sm:pt-6">
					<HomeHero displayName={session.user.name ?? "Student"} statusLine={statusLine} />
					<RecentNotesCard notes={recentNotes} />

					<HomeDashboardColumns
						left={<HomeFileExplorer workspaceId={workspace.id} initialTree={fileTree} folderId={requestedFolderId} />}
						right={
							<>
								<UpcomingExamsCard exams={serializedExams} />
								<StudySessionCard
									session={{
										totalQuestions: totalPlannedQuestionsToday,
										plannedQuestions: totalPlannedQuestionsToday,
										estimatedMinutes: estimatedSessionMinutes,
									}}
								/>
								<AiQuotaCard
									metrics={[
										{
											label: "Messages",
											used: preferredTextUsage?.requests.used ?? 0,
											limit: preferredTextUsage?.requests.limit ?? 0,
											display: `${preferredTextUsage?.requests.used ?? 0} / ${preferredTextUsage?.requests.limit ?? 0}`,
										},
										{
											label: "Tokens",
											used: preferredTextUsage?.tokens?.used ?? 0,
											limit: preferredTextUsage?.tokens?.limit ?? 0,
											display: `${formatCompactNumber(preferredTextUsage?.tokens?.used ?? 0)} / ${formatCompactNumber(preferredTextUsage?.tokens?.limit ?? 0)}`,
										},
										{
											label: "Transcription",
											used: preferredVoiceUsage?.audioSeconds?.used ?? 0,
											limit: preferredVoiceUsage?.audioSeconds?.limit ?? 0,
											display: `${Math.round((preferredVoiceUsage?.audioSeconds?.used ?? 0) / 60)} / ${Math.round((preferredVoiceUsage?.audioSeconds?.limit ?? 0) / 60)} min`,
										},
									]}
								/>
							</>
						}
					/>

					<footer className="mt-12 border-t border-white/5 pt-4 text-center text-xs text-zinc-500">Created ❤️ with by Fvitu © {currentYear}</footer>
				</div>
			</div>
		</div>
	);
}
