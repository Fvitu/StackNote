import { NextRequest, NextResponse } from "next/server"
import dns from "node:dns/promises"
import { isIP } from "node:net"
import { auth } from "@/lib/auth"
import { parseVideoEmbedUrl } from "@/lib/media"

interface LinkPreviewPayload {
  url: string
  title: string
  description: string
  image: string
  siteName: string
  favicon: string
  embedType: "none" | "video"
  embedUrl: string
  platform: "youtube" | "loom" | "vimeo" | "unknown"
}

const REQUEST_TIMEOUT_MS = 8000

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const regex = /([a-zA-Z_:.-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g

  for (const match of tag.matchAll(regex)) {
    const key = match[1]?.toLowerCase()
    const raw = match[2] ?? ""
    const value = raw.replace(/^['"]|['"]$/g, "").trim()
    if (!key || value.length === 0) continue
    attributes[key] = value
  }

  return attributes
}

function extractMetaTagContent(html: string, selectors: Array<{ key: "property" | "name"; value: string }>): string {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? []

  for (const tag of metaTags) {
    const attrs = parseAttributes(tag)
    for (const selector of selectors) {
      const actual = attrs[selector.key]
      if (actual && actual.toLowerCase() === selector.value.toLowerCase()) {
        return attrs.content ?? ""
      }
    }
  }

  return ""
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return ""
  return decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim())
}

function extractFaviconHref(html: string): string {
  const linkTags = html.match(/<link\s+[^>]*>/gi) ?? []

  for (const tag of linkTags) {
    const attrs = parseAttributes(tag)
    const rel = attrs.rel?.toLowerCase() ?? ""
    const href = attrs.href

    if (!href) continue
    if (rel.includes("icon")) return href
  }

  return ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function absolutizeUrl(baseUrl: string, value: string): string {
  if (!value) return ""
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return ""
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return false

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254)
  )
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80")
}

async function ensureSafePublicHost(hostname: string): Promise<void> {
  const normalizedHost = hostname.toLowerCase()
  if (normalizedHost === "localhost" || normalizedHost.endsWith(".local")) {
    throw new Error("Unsupported host")
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  if (records.length === 0) {
    throw new Error("Host not found")
  }

  for (const record of records) {
    const version = isIP(record.address)
    if (version === 4 && isPrivateIpv4(record.address)) {
      throw new Error("Unsupported host")
    }

    if (version === 6 && isPrivateIpv6(record.address)) {
      throw new Error("Unsupported host")
    }
  }
}

async function fetchYouTubeMetadata(url: string): Promise<Partial<LinkPreviewPayload>> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        "User-Agent": "StackNoteBot/1.0 (+https://stacknote.app)",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return {}
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          title?: string
          thumbnail_url?: string
          provider_name?: string
        }
      | null

    return {
      title: payload?.title?.trim() ?? "",
      image: payload?.thumbnail_url?.trim() ?? "",
      siteName: payload?.provider_name?.trim() || "YouTube",
    }
  } finally {
    clearTimeout(timeout)
  }
}

function buildFallbackPayload(url: string): LinkPreviewPayload {
  const parsed = new URL(url)
  return {
    url,
    title: parsed.hostname,
    description: "",
    image: "",
    siteName: parsed.hostname,
    favicon: `${parsed.origin}/favicon.ico`,
    embedType: "none",
    embedUrl: "",
    platform: "unknown",
  }
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get("url")?.trim() ?? ""

  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 })
  }

  let normalizedUrl: URL
  try {
    normalizedUrl = new URL(rawUrl)
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
  }

  if (normalizedUrl.protocol !== "http:" && normalizedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 })
  }

  try {
    await ensureSafePublicHost(normalizedUrl.hostname)
  } catch {
    return NextResponse.json({ error: "Host is not allowed" }, { status: 400 })
  }

  const url = normalizedUrl.toString()
  const video = parseVideoEmbedUrl(url)

  const fallback = buildFallbackPayload(url)
  const result: LinkPreviewPayload = {
    ...fallback,
    embedType: video.platform === "unknown" ? "none" : "video",
    embedUrl: video.embedUrl,
    platform: video.platform,
  }

  if (video.platform === "youtube") {
    const yt = await fetchYouTubeMetadata(url)
    result.title = yt.title || result.title
    result.image = yt.image || result.image
    result.siteName = yt.siteName || result.siteName
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StackNoteLinkPreview/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(result)
    }

    const finalUrl = response.url || url
    const html = await response.text()

    result.title =
      decodeHtmlEntities(
        extractMetaTagContent(html, [
          { key: "property", value: "og:title" },
          { key: "name", value: "twitter:title" },
        ]) || extractTitle(html),
      ) || result.title

    result.description =
      decodeHtmlEntities(
        extractMetaTagContent(html, [
          { key: "property", value: "og:description" },
          { key: "name", value: "twitter:description" },
          { key: "name", value: "description" },
        ]),
      ) || result.description

    result.image =
      absolutizeUrl(
        finalUrl,
        extractMetaTagContent(html, [
          { key: "property", value: "og:image" },
          { key: "name", value: "twitter:image" },
        ]),
      ) || result.image

    result.siteName =
      decodeHtmlEntities(
        extractMetaTagContent(html, [
          { key: "property", value: "og:site_name" },
          { key: "name", value: "application-name" },
        ]),
      ) || result.siteName

    const faviconHref = extractFaviconHref(html)
    result.favicon = absolutizeUrl(finalUrl, faviconHref) || `${new URL(finalUrl).origin}/favicon.ico`

    return NextResponse.json(result)
  } catch {
    return NextResponse.json(result)
  } finally {
    clearTimeout(timeout)
  }
}
