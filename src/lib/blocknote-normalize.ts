import { normalizeCodeLanguage } from "@/lib/editor-paste"

type UnknownRecord = Record<string, unknown>

function toRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as UnknownRecord
}

function inlineToText(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""

  const parts: string[] = []
  for (const item of value) {
    if (typeof item === "string") {
      parts.push(item)
      continue
    }

    const obj = toRecord(item)
    if (!obj) continue

    const text = obj.text
    if (typeof text === "string") {
      parts.push(text)
      continue
    }

    const content = obj.content
    if (Array.isArray(content)) {
      parts.push(inlineToText(content))
    }
  }

  return parts.join("")
}

function normalizeSingleBlock(block: unknown): unknown {
  const obj = toRecord(block)
  if (!obj) return block

  const type = obj.type
  if (type !== "codeBlock") return block

  const props = toRecord(obj.props) ?? {}
  const code =
    typeof props.code === "string"
      ? props.code
      : inlineToText(obj.content)

  return {
    ...obj,
    type: "codeBlock",
    content: undefined,
    props: {
      ...props,
      code,
      language: normalizeCodeLanguage(typeof props.language === "string" ? props.language : "typescript"),
      showLineNumbers:
        typeof props.showLineNumbers === "boolean" ? props.showLineNumbers : true,
      filename: typeof props.filename === "string" ? props.filename : "",
    },
  }
}

export function normalizeBlockNoteContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content
  return content.map((block) => normalizeSingleBlock(block))
}
