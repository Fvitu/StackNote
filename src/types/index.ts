export interface NoteTreeItem {
  id: string
  title: string
  emoji?: string | null
  type: "note"
}

export interface FolderTreeItem {
  id: string
  name: string
  type: "folder"
  children: FolderTreeItem[]
  notes: NoteTreeItem[]
}

export interface WorkspaceTree {
  folders: FolderTreeItem[]
  rootNotes: NoteTreeItem[]
}
