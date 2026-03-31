import { SUPPORTED_LANGUAGES, type SupportedLanguageId } from "@/lib/shiki-theme"

type LanguageAliasEntry = {
  alias: string
  language: SupportedLanguageId
}

const LANGUAGE_ALIASES: LanguageAliasEntry[] = [
  { alias: "typescript", language: "typescript" },
  { alias: "ts", language: "typescript" },
  { alias: "javascript", language: "javascript" },
  { alias: "js", language: "javascript" },
  { alias: "tsx", language: "tsx" },
  { alias: "jsx", language: "jsx" },
  { alias: "python", language: "python" },
  { alias: "py", language: "python" },
  { alias: "rust", language: "rust" },
  { alias: "rs", language: "rust" },
  { alias: "golang", language: "go" },
  { alias: "go", language: "go" },
  { alias: "java", language: "java" },
  { alias: "c++", language: "cpp" },
  { alias: "cpp", language: "cpp" },
  { alias: "c#", language: "csharp" },
  { alias: "csharp", language: "csharp" },
  { alias: "cs", language: "csharp" },
  { alias: "php", language: "php" },
  { alias: "ruby", language: "ruby" },
  { alias: "rb", language: "ruby" },
  { alias: "swift", language: "swift" },
  { alias: "kotlin", language: "kotlin" },
  { alias: "kt", language: "kotlin" },
  { alias: "html", language: "html" },
  { alias: "xml", language: "html" },
  { alias: "css", language: "css" },
  { alias: "scss", language: "scss" },
  { alias: "json", language: "json" },
  { alias: "yaml", language: "yaml" },
  { alias: "yml", language: "yaml" },
  { alias: "md", language: "markdown" },
  { alias: "markdown", language: "markdown" },
  { alias: "sql", language: "sql" },
  { alias: "bash", language: "bash" },
  { alias: "shell", language: "bash" },
  { alias: "sh", language: "bash" },
  { alias: "zsh", language: "bash" },
  { alias: "docker", language: "dockerfile" },
  { alias: "dockerfile", language: "dockerfile" },
  { alias: "prisma", language: "prisma" },
]

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n")
}

function isSupportedLanguageId(value: string): value is SupportedLanguageId {
  return SUPPORTED_LANGUAGES.some((language) => language.id === value)
}

export function findLanguageAlias(value: string): SupportedLanguageId | undefined {
  const normalized = value.toLowerCase()

  const exact = LANGUAGE_ALIASES.find((entry) => entry.alias === normalized)
  if (exact) {
    return exact.language
  }

  const parts = normalized
    .replace(/language-/g, " ")
    .split(/[^a-z0-9#+-]+/i)
    .filter(Boolean)

  for (const part of parts) {
    const alias = LANGUAGE_ALIASES.find((entry) => entry.alias === part)
    if (alias) {
      return alias.language
    }
  }

  return undefined
}

export function normalizeCodeLanguage(value: string | null | undefined): SupportedLanguageId {
  if (!value) {
    return "typescript"
  }

  if (isSupportedLanguageId(value)) {
    return value
  }

  return findLanguageAlias(value) ?? "typescript"
}

export function getLanguageHintFromLabel(text: string): SupportedLanguageId | undefined {
  const normalized = normalizeText(text).trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  const labelMatch = normalized.match(/^([a-z+#]+(?:\+\+)?)(?:\s+(?:code|snippet|block|example))?\s*:?\s*$/i)
  if (labelMatch) {
    return findLanguageAlias(labelMatch[1])
  }

  const contextualMatch = normalized.match(/^([a-z+#]+(?:\+\+)?)(?:\s+[\u2013\u2014-]\s+.+)?$/i)
  if (contextualMatch) {
    return findLanguageAlias(contextualMatch[1])
  }

  return undefined
}

function looksLikeJson(code: string): boolean {
  const trimmed = code.trim()
  if (!trimmed || !/^[\[{]/.test(trimmed)) {
    return false
  }

  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function detectCodeLanguage(code: string, hint?: string | null): SupportedLanguageId {
  const normalizedHint = normalizeCodeLanguage(hint)
  if (hint && normalizedHint) {
    return normalizedHint
  }

  const normalized = normalizeText(code)

  if (looksLikeJson(normalized)) {
    return "json"
  }

  if (/^\s*---\s*$|^\s*[a-z0-9_-]+\s*:\s+\S+/im.test(normalized)) {
    return "yaml"
  }

  if (/^\s*<(!doctype|html|[a-z][\w-]*)(\s|>)/i.test(normalized)) {
    return "html"
  }

  if (/^\s*[@.#][^{]+\{\s*[\w-]+\s*:/m.test(normalized)) {
    return "css"
  }

  if (/\b(from\s+\w+(?:\.\w+)*\s+import|import\s+\w+(?:\.\w+)*|def\s+\w+\(|class\s+\w+[:(]|@dataclass\b|self\b)/.test(normalized)) {
    return "python"
  }

  if (/\binterface\s+\w+|type\s+\w+\s*=|import\s+type\b|:\s*[A-Z][A-Za-z0-9_<>,[\]| ]+|as const\b/.test(normalized)) {
    if (/<[A-Z][A-Za-z0-9]*(\s|>)/.test(normalized)) {
      return "tsx"
    }

    return "typescript"
  }

  if (/<[A-Z][A-Za-z0-9]*(\s|>)/.test(normalized) || /return\s*\(\s*</.test(normalized)) {
    return "jsx"
  }

  if (/\b(const|let|var|function|export default|import\s+[\w*{])/m.test(normalized)) {
    return "javascript"
  }

  if (/\bpackage\s+main\b|\bfunc\s+\w+\(/.test(normalized)) {
    return "go"
  }

  if (/\bfn\s+\w+\(|\blet\s+mut\b|\bimpl\b|\bmatch\b/.test(normalized)) {
    return "rust"
  }

  if (/\bpublic\s+class\b|\bSystem\.out\.println\b|\bprivate\s+\w+\s+\w+\s*[;=]/.test(normalized)) {
    return "java"
  }

  if (/\busing\s+[\w.]+;|\bnamespace\s+[\w.]+|public\s+(?:class|record)\b/.test(normalized)) {
    return "csharp"
  }

  if (/^\s*#include\s+<[\w.]+>/m.test(normalized) || /\bstd::\w+/.test(normalized)) {
    return "cpp"
  }

  if (/^\s*#!/m.test(normalized) || /\becho\b|\bfi\b|\bdone\b|\bexport\s+[A-Z_]+=/m.test(normalized)) {
    return "bash"
  }

  if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\s+TABLE\b/i.test(normalized)) {
    return "sql"
  }

  if (/^\s*generator\s+client\s*\{|\bmodel\s+\w+\s*\{/m.test(normalized)) {
    return "prisma"
  }

  return "typescript"
}
