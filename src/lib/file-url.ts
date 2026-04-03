export function buildFileAccessUrl(fileId: string): string {
  return `/api/files/${encodeURIComponent(fileId)}`
}
