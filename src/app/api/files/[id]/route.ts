import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/server";

const BUCKET_NAME = "stacknote-files";
const FILE_COLUMNS_CACHE_TTL_MS = 60_000;

type FileRecord = {
	id: string;
	noteId: string | null;
	userId: string | null;
	name: string | null;
	mimeType: string | null;
	path: string | null;
	url: string | null;
};

let fileColumnsCache: {
	columns: Set<string>;
	updatedAt: number;
} | null = null;

function buildContentDisposition(fileName: string) {
	const sanitized = fileName.replace(/[\r\n"]/g, "_");
	const encoded = encodeURIComponent(fileName);
	return `attachment; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

function extractStoragePathFromUrl(url: string | null | undefined): string | null {
	if (!url) {
		return null;
	}

	const trimmed = url.trim();
	if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
		return null;
	}

	try {
		const parsed = new URL(trimmed);
		const match = decodeURIComponent(parsed.pathname).match(/\/storage\/v1\/object\/(?:sign|public)\/stacknote-files\/(.+)$/);
		return match?.[1] ? match[1] : null;
	} catch {
		return null;
	}
}

function normalizeStoragePath(path: string | null | undefined, fallbackUrl: string | null | undefined): string | null {
	const candidates = [path?.trim() ?? "", extractStoragePathFromUrl(path) ?? "", extractStoragePathFromUrl(fallbackUrl) ?? ""];

	for (const rawCandidate of candidates) {
		if (!rawCandidate) {
			continue;
		}

		if (rawCandidate.startsWith("/api/files/")) {
			continue;
		}

		let normalized = rawCandidate;
		normalized = normalized.replace(/^https?:\/\/[^/]+\//i, "");
		normalized = normalized.replace(/^storage\/v1\/object\/(?:sign|public)\/stacknote-files\//, "");
		normalized = normalized.replace(/^stacknote-files\//, "");
		normalized = normalized.replace(/^\/+/, "");
		normalized = normalized.split(/[?#]/)[0] ?? "";

		if (normalized) {
			return normalized;
		}
	}

	return null;
}

async function getFilesTableColumns() {
	const now = Date.now();
	if (fileColumnsCache && now - fileColumnsCache.updatedAt < FILE_COLUMNS_CACHE_TTL_MS) {
		return fileColumnsCache.columns;
	}

	const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'files'
	`);
	const columns = new Set(rows.map((row) => row.column_name));
	fileColumnsCache = { columns, updatedAt: now };
	return columns;
}

async function loadFileRecord(fileId: string): Promise<FileRecord | null> {
	const columns = await getFilesTableColumns();
	if (!columns.has("id")) {
		return null;
	}

	const selectColumns = [
		`"id"`,
		columns.has("noteId") ? `"noteId"` : `NULL::text AS "noteId"`,
		columns.has("userId") ? `"userId"` : `NULL::text AS "userId"`,
		columns.has("name") ? `"name"` : `NULL::text AS "name"`,
		columns.has("mimeType") ? `"mimeType"` : `NULL::text AS "mimeType"`,
		columns.has("path") ? `"path"` : `NULL::text AS "path"`,
		columns.has("url") ? `"url"` : `NULL::text AS "url"`,
	].join(", ");

	const rows = await prisma.$queryRaw<FileRecord[]>(Prisma.sql`
		SELECT ${Prisma.raw(selectColumns)}
		FROM "files"
		WHERE "id" = ${fileId}
		LIMIT 1
	`);

	return rows[0] ?? null;
}

async function getWorkspaceOwnerUserId(noteId: string | null) {
	if (!noteId) {
		return null;
	}

	const note = await prisma.note.findUnique({
		where: { id: noteId },
		select: {
			workspace: {
				select: {
					userId: true,
				},
			},
		},
	});

	return note?.workspace.userId ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;

	const file = await loadFileRecord(id);

	if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

	const isOwner = file.userId === session.user.id;
	const workspaceOwnerId = await getWorkspaceOwnerUserId(file.noteId);
	const isWorkspaceOwner = workspaceOwnerId === session.user.id;

	if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const storagePath = normalizeStoragePath(file.path, file.url);
	if (!storagePath) {
		return NextResponse.json({ error: "File path is invalid or missing" }, { status: 500 });
	}

	const supabase = createAdminClient();
	const isDownload = req.nextUrl.searchParams.get("download") === "1";

	if (!isDownload) {
		const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(storagePath, 60);

		if (signedError || !signedData?.signedUrl) {
			if (file.url && /^https?:\/\//i.test(file.url) && !file.url.includes("/api/files/")) {
				const legacyRedirect = NextResponse.redirect(file.url, { status: 307 });
				legacyRedirect.headers.set("Cache-Control", "private, no-store");
				return legacyRedirect;
			}

			return NextResponse.json({ error: signedError?.message ?? "Failed to create signed URL" }, { status: 500 });
		}

		const redirect = NextResponse.redirect(signedData.signedUrl, { status: 307 });
		redirect.headers.set("Cache-Control", "private, no-store");
		return redirect;
	}

	const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);

	if (error || !data) {
		return NextResponse.json({ error: error?.message ?? "Failed to download file" }, { status: 500 });
	}

	const fileBuffer = Buffer.from(await data.arrayBuffer());

	return new NextResponse(fileBuffer, {
		headers: {
			"Content-Type": file.mimeType ?? "application/octet-stream",
			"Content-Disposition": buildContentDisposition(file.name ?? "download"),
			"Content-Length": String(fileBuffer.byteLength),
			"Cache-Control": "private, no-store",
		},
	});
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;

	const file = await loadFileRecord(id);

	if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

	// Allow deletion by file owner or workspace owner
	const isOwner = file.userId === session.user.id;
	const workspaceOwnerId = await getWorkspaceOwnerUserId(file.noteId);
	const isWorkspaceOwner = workspaceOwnerId === session.user.id;

	if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const supabase = createAdminClient();
	const storagePath = normalizeStoragePath(file.path, file.url);

	try {
		// Remove from storage
		if (storagePath) {
			const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
			if (removeError) {
				// Log and continue to attempt DB cleanup
				console.error("Supabase remove error:", removeError);
			}
		} else {
			console.warn("Skipping storage removal for file with invalid path", { fileId: file.id });
		}

		// Delete DB record
		await prisma.$executeRaw(Prisma.sql`
			DELETE FROM "files"
			WHERE "id" = ${id}
		`);
		console.log("Deleted file record:", id);

		return NextResponse.json({ success: true });
	} catch (err) {
		console.error(err);
		return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
	}
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = await params;
	const body = await req.json();
	const name = typeof body?.name === "string" ? body.name.trim() : "";

	if (!name) {
		return NextResponse.json({ error: "name is required" }, { status: 400 });
	}

	const file = await loadFileRecord(id);

	if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

	const isOwner = file.userId === session.user.id;
	const workspaceOwnerId = await getWorkspaceOwnerUserId(file.noteId);
	const isWorkspaceOwner = workspaceOwnerId === session.user.id;

	if (!isOwner && !isWorkspaceOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

	const columns = await getFilesTableColumns();
	if (!columns.has("name")) {
		return NextResponse.json({ error: "The files.name column is missing in the current database." }, { status: 500 });
	}

	await prisma.$executeRaw(Prisma.sql`
		UPDATE "files"
		SET "name" = ${name}
		WHERE "id" = ${id}
	`);

	return NextResponse.json({
		id,
		name,
	});
}
