import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import type { UnsplashCoverSearchResult } from "@/lib/note-cover"

const UNSPLASH_API_BASE = "https://api.unsplash.com"
const DEFAULT_RESULTS = 18
const MAX_RESULTS = 24

function withUtm(url: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set("utm_source", "stacknote")
  parsed.searchParams.set("utm_medium", "referral")
  return parsed.toString()
}

function mapUnsplashPhoto(photo: Record<string, unknown>): UnsplashCoverSearchResult | null {
  const urls = typeof photo.urls === "object" && photo.urls !== null ? (photo.urls as Record<string, unknown>) : null
  const user = typeof photo.user === "object" && photo.user !== null ? (photo.user as Record<string, unknown>) : null
  const userLinks = user && typeof user.links === "object" && user.links !== null ? (user.links as Record<string, unknown>) : null
  const links = typeof photo.links === "object" && photo.links !== null ? (photo.links as Record<string, unknown>) : null

  if (
    typeof photo.id !== "string" ||
    !urls ||
    typeof urls.small !== "string" ||
    typeof urls.regular !== "string" ||
    !user ||
    typeof user.name !== "string" ||
    !userLinks ||
    typeof userLinks.html !== "string" ||
    !links ||
    typeof links.html !== "string" ||
    typeof links.download_location !== "string"
  ) {
    return null
  }

  const altText =
    typeof photo.alt_description === "string" && photo.alt_description.trim().length > 0
      ? photo.alt_description
      : typeof photo.description === "string" && photo.description.trim().length > 0
        ? photo.description
        : `Photo by ${user.name}`

  return {
    id: photo.id,
    alt: altText,
    color: typeof photo.color === "string" ? photo.color : null,
    thumbUrl: urls.small,
    regularUrl: urls.regular,
    photographerName: user.name,
    photographerUrl: withUtm(userLinks.html),
    photoUrl: withUtm(links.html),
    downloadLocation: links.download_location,
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (!accessKey) {
    return NextResponse.json(
      { error: "Unsplash is not configured. Add UNSPLASH_ACCESS_KEY to enable cover search." },
      { status: 503 },
    )
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")?.trim() ?? ""
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1)
  const perPage = Math.min(MAX_RESULTS, Math.max(6, Number(searchParams.get("perPage") ?? String(DEFAULT_RESULTS)) || DEFAULT_RESULTS))

  const endpoint = query.length > 0
    ? `${UNSPLASH_API_BASE}/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=landscape&content_filter=high`
    : `${UNSPLASH_API_BASE}/topics/wallpapers/photos?page=${page}&per_page=${perPage}&orientation=landscape`

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as
    | { errors?: string[]; total_pages?: number; results?: Record<string, unknown>[] }
    | Record<string, unknown>[]
    | null

  if (!response.ok) {
    const errorMessage =
      payload && !Array.isArray(payload) && Array.isArray(payload.errors) && payload.errors.length > 0
        ? payload.errors[0]
        : "Failed to fetch cover images"

    return NextResponse.json({ error: errorMessage }, { status: response.status })
  }

  const rawResults =
    payload && !Array.isArray(payload) && Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload)
        ? payload
        : []

  const results = rawResults
    .map((photo) => mapUnsplashPhoto(photo))
    .filter((photo): photo is UnsplashCoverSearchResult => photo !== null)

  return NextResponse.json({
    results,
    page,
    totalPages: payload && !Array.isArray(payload) && typeof payload.total_pages === "number" ? payload.total_pages : undefined,
  })
}
