import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { collectStoredFilePathsForNotes, deleteStoredObjects, getTrashCutoffDate } from "@/lib/trash";

const CRON_LOCK_KEY = "stacknote:cron:purge-trash";
const CRON_LOCK_TTL_SECONDS = 60 * 10;
const MUTABLE_CACHE_CONTROL = "private, max-age=0, must-revalidate";

function readBearerToken(request: NextRequest) {
	const header = request.headers.get("authorization")?.trim() ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(header);
	return match?.[1]?.trim() ?? "";
}

function isVercelCronRequest(request: NextRequest) {
	return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: NextRequest) {
	const cronSecret = process.env.CRON_SECRET?.trim();
	if (!isVercelCronRequest(request) && (!cronSecret || readBearerToken(request) !== cronSecret)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let lockAcquired = false;

	try {
		if (redis) {
			const result = await redis.set(CRON_LOCK_KEY, "1", "EX", CRON_LOCK_TTL_SECONDS, "NX");
			lockAcquired = result === "OK";

			if (!lockAcquired) {
				return NextResponse.json({ error: "Purge already running" }, { status: 409 });
			}
		}

		const cutoffDate = getTrashCutoffDate();
		const [notes, folders] = await Promise.all([
			prisma.note.findMany({
				where: {
					deletedAt: {
						lte: cutoffDate,
					},
				},
				select: {
					id: true,
				},
			}),
			prisma.folder.findMany({
				where: {
					deletedAt: {
						lte: cutoffDate,
					},
				},
				select: {
					id: true,
				},
			}),
		]);

		const noteIds = notes.map((note) => note.id);
		const folderIds = folders.map((folder) => folder.id);
		const paths = await collectStoredFilePathsForNotes(prisma, noteIds);
		const purgedFiles = await deleteStoredObjects(paths);

		const purged = await prisma.$transaction(async (tx) => {
			if (noteIds.length > 0) {
				await tx.file.deleteMany({
					where: {
						noteId: {
							in: noteIds,
						},
					},
				});
			}

			const [purgedNotes, purgedFolders] = await Promise.all([
				noteIds.length > 0
					? tx.note.deleteMany({
							where: {
								id: {
									in: noteIds,
								},
							},
						})
					: Promise.resolve({ count: 0 }),
				folderIds.length > 0
					? tx.folder.deleteMany({
							where: {
								id: {
									in: folderIds,
								},
							},
						})
					: Promise.resolve({ count: 0 }),
			]);

			return {
				purgedNotes: purgedNotes.count,
				purgedFolders: purgedFolders.count,
			};
		});

		console.log("[trash] purge summary", {
			purgedNotes: purged.purgedNotes,
			purgedFolders: purged.purgedFolders,
			purgedFiles,
		});

		return NextResponse.json(
			{
				purgedNotes: purged.purgedNotes,
				purgedFolders: purged.purgedFolders,
				purgedFiles,
			},
			{
				headers: {
					"Cache-Control": MUTABLE_CACHE_CONTROL,
				},
			},
		);
	} catch (error) {
		console.error("Failed to purge expired trash:", error);
		return NextResponse.json({ error: "Failed to purge trash" }, { status: 500 });
	} finally {
		if (redis && lockAcquired) {
			await redis.del(CRON_LOCK_KEY).catch(() => undefined);
		}
	}
}
