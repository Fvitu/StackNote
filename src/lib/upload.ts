import type { MediaType } from "@/lib/media"

export interface UploadResponse {
  url: string
  fileId: string
  filePath: string
  type: MediaType
  name: string
  size: number
  mimeType: string
}

export async function uploadFileForNote(
  noteId: string,
  file: File,
  type: MediaType,
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("noteId", noteId)
  formData.append("type", type)

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? "Upload failed")
  }

  return (await response.json()) as UploadResponse
}
