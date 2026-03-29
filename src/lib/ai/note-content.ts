/**
 * Extract plain-text note context from BlockNote JSON without shipping the full
 * document structure into every AI request.
 */

import { parseAssistantResponseContent } from "@/lib/ai-response"

interface InlineContent {
  type?: string
  text?: string
  props?: Record<string, unknown>
  content?: InlineContent[] | string
}

interface Block {
  type: string
  content?: InlineContent[] | Block[] | string
  children?: Block[]
  props?: Record<string, unknown>
}

export interface NoteImageAttachment {
  url: string
  alt?: string
  caption?: string
}

export interface NotePdfAttachment {
  url: string
  filename?: string
  caption?: string
}

function getStringProp(props: Record<string, unknown> | undefined, key: string) {
  const value = props?.[key]
  return typeof value === "string" ? value.trim() : ""
}

function joinParts(parts: Array<string | undefined | null>) {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" | ")
}

function extractTextFromInline(inline: InlineContent | InlineContent[] | string | undefined): string {
  if (!inline) {
    return ""
  }

  if (typeof inline === "string") {
    return inline
  }

  if (Array.isArray(inline)) {
    return inline.map((item) => extractTextFromInline(item)).join("")
  }

  if (inline.text) {
    return inline.text
  }

  if (inline.type === "inlineEquation") {
    const latex = getStringProp(inline.props, "latex")
    return latex ? `$${latex}$` : ""
  }

  if (inline.content) {
    return extractTextFromInline(inline.content)
  }

  return ""
}

function getBlockOwnText(block: Block): string {
  if (!block.content) {
    return ""
  }

  if (typeof block.content === "string") {
    return block.content.trim()
  }

  if (!Array.isArray(block.content)) {
    return ""
  }

  return block.content
    .map((item) => {
      if (typeof item === "string") {
        return item
      }

      if ("text" in item || item.type === "inlineEquation") {
        return extractTextFromInline(item as InlineContent)
      }

      return extractTextFromBlock(item as Block)
    })
    .join("")
    .trim()
}

function extractTextFromBlock(block: Block): string {
  const ownText = getBlockOwnText(block)
  const parts = ownText ? [ownText] : []

  switch (block.type) {
    case "heading": {
      const level = typeof block.props?.level === "number" ? block.props.level : 1
      parts[0] = `${"#".repeat(level)} ${parts[0] ?? ""}`.trim()
      break
    }
    case "bulletListItem":
    case "numberedListItem":
      parts[0] = `- ${parts[0] ?? ""}`.trim()
      break
    case "checkListItem": {
      const checked = block.props?.checked ? "[x]" : "[ ]"
      parts[0] = `${checked} ${parts[0] ?? ""}`.trim()
      break
    }
    case "codeBlock": {
      const code = getStringProp(block.props, "code")
      if (code) {
        const language = getStringProp(block.props, "language")
        const filename = getStringProp(block.props, "filename")
        const label = joinParts([filename, language])
        parts.push(`\`\`\`${language || ""}\n${code}\n\`\`\`${label ? `\n[Code block: ${label}]` : ""}`)
      }
      break
    }
    case "equation": {
      const latex = getStringProp(block.props, "latex")
      if (latex) {
        parts.push(`$$${latex}$$`)
      }
      break
    }
    case "linkPreview": {
      const title = getStringProp(block.props, "title")
      const description = getStringProp(block.props, "description")
      const siteName = getStringProp(block.props, "siteName")
      const url = getStringProp(block.props, "url")
      const summary = joinParts([title, description, siteName, url])
      if (summary) {
        parts.push(`[Embedded link: ${summary}]`)
      }
      break
    }
    case "videoEmbed": {
      const title = getStringProp(block.props, "title")
      const platform = getStringProp(block.props, "platform")
      const summary = joinParts([title || "Embedded video", platform])
      if (summary) {
        parts.push(`[Embedded video: ${summary}]`)
      }
      break
    }
    case "aiBlock": {
      const prompt = getStringProp(block.props, "prompt")
      const rawResponse = getStringProp(block.props, "response")
      const response = rawResponse ? parseAssistantResponseContent(rawResponse).finalContent.trim() : ""

      if (prompt) {
        parts.push(`[AI prompt]\n${prompt}`)
      }

      if (response) {
        parts.push(`[AI response]\n${response}`)
      }
      break
    }
    case "imageMedia":
    case "pdfMedia":
    case "audioMedia":
    case "videoMedia": {
      const label = joinParts([
        getStringProp(block.props, "caption"),
        getStringProp(block.props, "filename"),
        getStringProp(block.props, "name"),
        getStringProp(block.props, "alt"),
      ])
      if (label) {
        parts.push(`[Media: ${label}]`)
      }
      break
    }
    default:
      break
  }

  if (Array.isArray(block.children)) {
    for (const child of block.children) {
      const childText = extractTextFromBlock(child)
      if (childText) {
        parts.push(childText)
      }
    }
  }

  return parts.filter(Boolean).join("\n").trim()
}

function collectBlocks(content: unknown): Block[] {
  if (!Array.isArray(content)) {
    return []
  }

  return content.filter((item): item is Block => Boolean(item && typeof item === "object" && "type" in item))
}

export function noteContentToText(content: unknown): string {
  const blocks = collectBlocks(content)
  return blocks
    .map((block) => extractTextFromBlock(block))
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function collectImageAttachments(block: Block, attachments: NoteImageAttachment[]) {
  if (block.type === "imageMedia") {
    const url = getStringProp(block.props, "url")
    if (url) {
      attachments.push({
        url,
        alt: getStringProp(block.props, "alt") || undefined,
        caption: getStringProp(block.props, "caption") || undefined,
      })
    }
  }

  for (const child of block.children ?? []) {
    collectImageAttachments(child, attachments)
  }
}

function collectPdfAttachments(block: Block, attachments: NotePdfAttachment[]) {
  if (block.type === "pdfMedia") {
    const url = getStringProp(block.props, "url")
    if (url) {
      attachments.push({
        url,
        filename: getStringProp(block.props, "filename") || undefined,
        caption: getStringProp(block.props, "caption") || undefined,
      })
    }
  }

  for (const child of block.children ?? []) {
    collectPdfAttachments(child, attachments)
  }
}

function dedupeByUrl<T extends { url: string }>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.url)) {
      return false
    }
    seen.add(item.url)
    return true
  })
}

export function extractNoteImageAttachments(content: unknown): NoteImageAttachment[] {
  const attachments: NoteImageAttachment[] = []

  for (const block of collectBlocks(content)) {
    collectImageAttachments(block, attachments)
  }

  return dedupeByUrl(attachments)
}

export function extractNotePdfAttachments(content: unknown): NotePdfAttachment[] {
  const attachments: NotePdfAttachment[] = []

  for (const block of collectBlocks(content)) {
    collectPdfAttachments(block, attachments)
  }

  return dedupeByUrl(attachments)
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4
  if (text.length <= maxChars) {
    return text
  }
  return `${text.slice(0, maxChars)}\n\n[Content truncated...]`
}
