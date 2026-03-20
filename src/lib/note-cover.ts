export const NOTE_COVER_SOURCES = ["upload", "unsplash", "external"] as const

export type NoteCoverSource = (typeof NOTE_COVER_SOURCES)[number]

export interface UploadedNoteCoverMeta {
  source: "upload"
  fileId: string
  filePath: string
  mimeType: string
  size: number
  name: string
  positionX?: number
  positionY?: number
}

export interface UnsplashNoteCoverMeta {
  source: "unsplash"
  photoId: string
  thumbUrl: string
  photographerName: string
  photographerUrl: string
  photoUrl: string
  positionX?: number
  positionY?: number
}

export interface ExternalNoteCoverMeta {
  source: "external"
  originalUrl: string
  positionX?: number
  positionY?: number
}

export type NoteCoverMeta =
  | UploadedNoteCoverMeta
  | UnsplashNoteCoverMeta
  | ExternalNoteCoverMeta

export interface UnsplashCoverSearchResult {
  id: string
  alt: string
  color: string | null
  thumbUrl: string
  regularUrl: string
  photographerName: string
  photographerUrl: string
  photoUrl: string
  downloadLocation: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function parseNoteCoverMeta(value: unknown): NoteCoverMeta | null {
  if (!isRecord(value) || typeof value.source !== "string") {
    return null
  }

  switch (value.source) {
    case "upload":
      if (
        typeof value.fileId === "string" &&
        typeof value.filePath === "string" &&
        typeof value.mimeType === "string" &&
        typeof value.size === "number" &&
        typeof value.name === "string"
      ) {
        return {
          source: "upload",
          fileId: value.fileId,
          filePath: value.filePath,
          mimeType: value.mimeType,
          size: value.size,
          name: value.name,
          positionX: typeof value.positionX === "number" ? value.positionX : undefined,
          positionY: typeof value.positionY === "number" ? value.positionY : undefined,
        }
      }
      return null
    case "unsplash":
      if (
        typeof value.photoId === "string" &&
        typeof value.thumbUrl === "string" &&
        typeof value.photographerName === "string" &&
        typeof value.photographerUrl === "string" &&
        typeof value.photoUrl === "string"
      ) {
        return {
          source: "unsplash",
          photoId: value.photoId,
          thumbUrl: value.thumbUrl,
          photographerName: value.photographerName,
          photographerUrl: value.photographerUrl,
          photoUrl: value.photoUrl,
          positionX: typeof value.positionX === "number" ? value.positionX : undefined,
          positionY: typeof value.positionY === "number" ? value.positionY : undefined,
        }
      }
      return null
    case "external":
      if (typeof value.originalUrl === "string") {
        return {
          source: "external",
          originalUrl: value.originalUrl,
          positionX: typeof value.positionX === "number" ? value.positionX : undefined,
          positionY: typeof value.positionY === "number" ? value.positionY : undefined,
        }
      }
      return null
    default:
      return null
  }
}

export function resolveNoteCoverMeta(coverImage: string | null | undefined, meta: unknown): NoteCoverMeta | null {
  const parsed = parseNoteCoverMeta(meta)
  if (parsed) {
    return parsed
  }

  if (typeof coverImage === "string" && coverImage.length > 0 && isValidHttpUrl(coverImage)) {
    return {
      source: "external",
      originalUrl: coverImage,
      positionX: 50,
      positionY: 50,
    }
  }

  return null
}
