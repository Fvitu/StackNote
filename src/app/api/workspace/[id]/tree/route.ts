import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { noteContentToText } from "@/lib/ai/note-content"
import type { FolderTreeItem, NoteTreeItem, WorkspaceTree } from "@/types"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const workspace = await prisma.workspace.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!workspace) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const folders = await prisma.folder.findMany({
    where: { workspaceId: id },
    orderBy: { order: "asc" },
  })

  const notes = await prisma.note.findMany({
		where: { workspaceId: id, isArchived: false },
		orderBy: { order: "asc" },
		select: {
			id: true,
			title: true,
			emoji: true,
			folderId: true,
			content: true,
			createdAt: true,
			updatedAt: true,
		},
  });

  // Build nested tree
  const folderMap = new Map<string, FolderTreeItem>()

  for (const f of folders) {
    folderMap.set(f.id, {
      id: f.id,
      name: f.name,
      type: "folder",
      children: [],
      notes: [],
    })
  }

  // Assign notes to their folders
  const rootNotes: NoteTreeItem[] = []
  for (const n of notes) {
	const item: NoteTreeItem = {
		id: n.id,
		title: n.title,
		emoji: n.emoji,
		contentText: noteContentToText(n.content),
		createdAt: n.createdAt.toISOString(),
		updatedAt: n.updatedAt.toISOString(),
		folderId: n.folderId,
		type: "note",
	};
    if (n.folderId && folderMap.has(n.folderId)) {
      folderMap.get(n.folderId)!.notes.push(item)
    } else {
      rootNotes.push(item)
    }
  }

  // Build folder hierarchy
  const rootFolders: FolderTreeItem[] = []
  for (const f of folders) {
    const item = folderMap.get(f.id)!
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId)!.children.push(item)
    } else {
      rootFolders.push(item)
    }
  }

  const tree: WorkspaceTree = {
    folders: rootFolders,
    rootNotes,
  }

  return NextResponse.json(tree)
}
