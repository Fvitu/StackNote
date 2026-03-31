import { markdownToHTML } from "@blocknote/core"
import type { SupportedLanguageId } from "@/lib/shiki-theme"
import { detectCodeLanguage, findLanguageAlias, getLanguageHintFromLabel } from "@/lib/code-language"

export const EQUATION_BLOCK_TYPE = "equation"
export const INLINE_EQUATION_TYPE = "inlineEquation"
export const DATA_CONTENT_TYPE_ATTR = "data-content-type"
export const DATA_INLINE_CONTENT_TYPE_ATTR = "data-inline-content-type"
export const DATA_LATEX_ATTR = "data-latex"
export const DATA_DISPLAY_MODE_ATTR = "data-display-mode"

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "FIGCAPTION",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "UL",
])

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n")
}

function getLanguageHintFromElement(element: Element): SupportedLanguageId | undefined {
  const attributesToCheck = [
    element.getAttribute("data-language"),
    element.getAttribute("lang"),
    element.getAttribute("data-code-language"),
    element.className,
  ]

  for (const value of attributesToCheck) {
    const normalized = findLanguageAlias(value ?? "")
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function looksLikeCodeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  if (/^(from|import|export|def|class|interface|type|const|let|var|function|package|func|fn|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(trimmed)) {
    return true
  }

  if (/^(@[a-z_][\w]*)/i.test(trimmed)) {
    return true
  }

  if (/^(if|else|elif|for|while|match|switch|case|return|yield|await|async|try|except|catch|finally)\b/.test(trimmed)) {
    return true
  }

  if (/^(public|private|protected|static|final|sealed|extends|implements)\b/.test(trimmed)) {
    return true
  }

  if (/^(<\w|<\/\w)/.test(trimmed)) {
    return true
  }

  if (/^[\]\[}{)(].*|.*[;{}()[\]<>]=?.*$/.test(trimmed)) {
    return true
  }

  if (/(=>|:=|::|->|<\/|\/>|==|===|!=|!==|\+=|-=|\*=|\/=)/.test(trimmed)) {
    return true
  }

  if (/^[a-z_][\w.]*\s*=/.test(trimmed)) {
    return true
  }

  return false
}

function looksLikeCodeBlock(text: string, hint?: SupportedLanguageId): boolean {
  const normalized = normalizeText(text)
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    return false
  }

  const codeLikeLines = lines.filter(looksLikeCodeLine).length
  const indentedLines = lines.filter((line) => /^\s{2,}\S/.test(line) || /^\t+\S/.test(line)).length
  const punctuationLines = lines.filter((line) => /[{}()[\];=<>]/.test(line)).length

  let score = 0

  if (hint) {
    score += 1
  }

  if (codeLikeLines >= Math.max(2, Math.ceil(lines.length * 0.4))) {
    score += 2
  }

  if (indentedLines > 0) {
    score += 1
  }

  if (punctuationLines >= Math.max(1, Math.ceil(lines.length * 0.3))) {
    score += 1
  }

  if (/^#!/m.test(normalized) || /@dataclass\b/.test(normalized)) {
    score += 2
  }

  return score >= 3
}

function stripAttachedLanguagePrefix(text: string): { code: string; hint?: SupportedLanguageId } {
  const normalized = normalizeText(text)

  for (const alias of normalized
    .toLowerCase()
    .split(/[^a-z0-9#+-]+/i)
    .filter(Boolean)) {
    const hint = findLanguageAlias(alias)
    if (!hint || !normalized.toLowerCase().startsWith(alias)) {
      continue
    }

    const remainder = normalized.slice(alias.length)
    if (/^(from\s|import\s|class\s|def\s|const\s|let\s|var\s|function\s|package\s|func\s|fn\s|SELECT\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\b|ALTER\b|DROP\b|<\/?[a-z]|\{|\[|\()/i.test(remainder)) {
      return {
        code: remainder,
        hint,
      }
    }
  }

  return { code: normalized }
}

function isLeafBlockCandidate(element: Element): boolean {
  for (const child of Array.from(element.children)) {
    if (child.tagName === "BR") {
      continue
    }

    if (BLOCK_TAGS.has(child.tagName)) {
      return false
    }
  }

  return true
}

function getTextWithLineBreaks(node: Node, root = false): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ""
  }

  if (!(node instanceof HTMLElement)) {
    return ""
  }

  if (node.tagName === "BR") {
    return "\n"
  }

  const parts: string[] = []
  for (const child of Array.from(node.childNodes)) {
    parts.push(getTextWithLineBreaks(child))
  }

  const joined = parts.join("")
  if (root) {
    return joined
  }

  return BLOCK_TAGS.has(node.tagName) ? `${joined}\n` : joined
}

function previousMeaningfulSibling(element: Element): Element | null {
  let current = element.previousElementSibling

  while (current) {
    const text = getTextWithLineBreaks(current, true).trim()
    if (text.length > 0) {
      return current
    }

    current = current.previousElementSibling
  }

  return null
}

function isStandaloneLanguageLabel(text: string): boolean {
  return getLanguageHintFromLabel(text) !== undefined
}

function unwrapDisplayMath(text: string): string | undefined {
  const normalized = normalizeText(text).trim()
  if (!normalized) {
    return undefined
  }

  const explicitBlock = normalized.match(/^\$\$([\s\S]+)\$\$$/)
  if (explicitBlock) {
    return explicitBlock[1].trim()
  }

  const bracketBlock = normalized.match(/^\\\[([\s\S]+)\\\]$/)
  if (bracketBlock) {
    return bracketBlock[1].trim()
  }

  const environmentBlock = normalized.match(/^\\begin\{([a-z*]+)\}([\s\S]+)\\end\{\1\}$/i)
  if (environmentBlock) {
    return normalized
  }

  const containsSentenceSeparators = /(^|[^\\])[.!?]\s+[A-Z]/.test(normalized) || /(^|[^\\]),\s+[a-z]/.test(normalized)
  const containsInlineDelimiters = /(^|[^\\])\$(?!\$)|\\\(|\\\)/.test(normalized)
  const containsLineBreaks = normalized.includes("\n")
  const containsLabelPrefix = /^[A-Za-z][A-Za-z\s-]{2,}:\s/.test(normalized)
  const textWithoutLatexCommands = normalized.replace(/\\[a-zA-Z]+/g, " ")
  const plainWordTokens = textWithoutLatexCommands.match(/\b[a-zA-Z]{3,}\b/g) ?? []
  const plainWordsOutsideLatexCommands = plainWordTokens.length
  const mathSignals =
    /[=^_]/.test(normalized) ||
    /\\(?:frac|sqrt|sum|int|prod|hat|bar|vec|alpha|beta|gamma|theta|lambda|pi|sigma|xi|cdot|times|qquad|mathbf|mathrm|left|right)/.test(normalized)

  if (
    mathSignals &&
    /\\[a-zA-Z]+/.test(normalized) &&
    !containsSentenceSeparators &&
    !containsLabelPrefix &&
    !containsInlineDelimiters &&
    (containsLineBreaks || plainWordsOutsideLatexCommands <= 2)
  ) {
    return normalized
  }

  return undefined
}

function looksLikeMarkdownOrStructuredText(text: string): boolean {
  const normalized = normalizeText(text)

  return (
    /(^|\n)(```|~~~)/.test(normalized) ||
    /(^|\n)\s*#{1,6}\s+\S/.test(normalized) ||
    /(^|\n)\s*([-*+]|\d+\.)\s+\S/.test(normalized) ||
    /(^|\n)\s*>\s+\S/.test(normalized) ||
    /(^|\n)\|.+\|/.test(normalized)
  )
}

function looksLikeInlineMathExpression(text: string): boolean {
  const normalized = text.trim()
  if (!normalized) {
    return false
  }

  if (/^\d+(?:[.,]\d+)?$/.test(normalized)) {
    return false
  }

  return /\\[a-zA-Z]+|[=^_{}<>]|[A-Za-z]/.test(normalized)
}

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0
  let current = index - 1

  while (current >= 0 && text[current] === "\\") {
    backslashCount += 1
    current -= 1
  }

  return backslashCount % 2 === 1
}

function createInlineEquationPlaceholder(document: Document, latex: string): HTMLElement {
  const span = document.createElement("span")
  span.setAttribute(DATA_INLINE_CONTENT_TYPE_ATTR, INLINE_EQUATION_TYPE)
  span.setAttribute(DATA_LATEX_ATTR, latex)
  span.textContent = `\\(${latex}\\)`
  return span
}

function createEquationBlockPlaceholder(document: Document, latex: string, displayMode: boolean): HTMLElement {
  const container = document.createElement("div")
  container.setAttribute(DATA_CONTENT_TYPE_ATTR, EQUATION_BLOCK_TYPE)
  container.setAttribute(DATA_LATEX_ATTR, latex)
  container.setAttribute(DATA_DISPLAY_MODE_ATTR, displayMode ? "true" : "false")
  container.textContent = displayMode ? `$$${latex}$$` : `\\(${latex}\\)`
  return container
}

function replaceInlineMathTextNode(textNode: Text): void {
  const text = textNode.textContent ?? ""
  if (!text.trim()) {
    return
  }

  const document = textNode.ownerDocument
  if (!document) {
    return
  }

  const fragment = document.createDocumentFragment()
  let cursor = 0
  let replaced = false

  while (cursor < text.length) {
    const inlineStart = text.indexOf("\\(", cursor)
    const dollarStart = text.indexOf("$", cursor)
    const candidates = [inlineStart, dollarStart].filter((index) => index >= 0)
    if (candidates.length === 0) {
      break
    }

    const start = Math.min(...candidates)

    if (text[start] === "$" && (isEscaped(text, start) || text[start + 1] === "$")) {
      cursor = start + 1
      continue
    }

    if (text.slice(start, start + 2) === "\\(" && isEscaped(text, start)) {
      cursor = start + 2
      continue
    }

    let end = -1
    let latex = ""

    if (text.slice(start, start + 2) === "\\(") {
      end = text.indexOf("\\)", start + 2)
      if (end >= 0) {
        latex = text.slice(start + 2, end)
      }
    } else {
      let search = start + 1
      while (search < text.length) {
        const nextDollar = text.indexOf("$", search)
        if (nextDollar < 0) {
          break
        }

        if (!isEscaped(text, nextDollar) && text[nextDollar - 1] !== "$" && text[nextDollar + 1] !== "$") {
          end = nextDollar
          latex = text.slice(start + 1, nextDollar)
          break
        }

        search = nextDollar + 1
      }
    }

    if (end < 0 || !looksLikeInlineMathExpression(latex)) {
      cursor = start + 1
      continue
    }

    if (start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, start)))
    }

    fragment.append(createInlineEquationPlaceholder(document, latex.trim()))
    cursor = text.slice(start, start + 2) === "\\(" ? end + 2 : end + 1
    replaced = true
  }

  if (!replaced) {
    return
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)))
  }

  textNode.replaceWith(fragment)
}

function transformBlockCandidates(document: Document): void {
  const candidates = Array.from(document.body.querySelectorAll("p, div, li, blockquote, figcaption"))

  for (const element of candidates) {
    if (!element.isConnected) {
      continue
    }

    if (!isLeafBlockCandidate(element)) {
      continue
    }

    if (element.closest("pre, code")) {
      continue
    }

    if (element.getAttribute(DATA_CONTENT_TYPE_ATTR) === EQUATION_BLOCK_TYPE) {
      continue
    }

    const rawText = normalizeText(getTextWithLineBreaks(element, true)).trim()
    if (!rawText) {
      continue
    }

    const displayLatex = unwrapDisplayMath(rawText)
    if (displayLatex) {
      element.replaceWith(createEquationBlockPlaceholder(document, displayLatex, true))
      continue
    }

    let codeText = rawText
    let hint = getLanguageHintFromElement(element)
    let removePreviousLabel = false

    const previousSibling = previousMeaningfulSibling(element)
    if (previousSibling) {
      const previousText = normalizeText(getTextWithLineBreaks(previousSibling, true)).trim()
      const previousHint = getLanguageHintFromLabel(previousText)
      if (previousHint) {
        hint = hint ?? previousHint
        removePreviousLabel = isStandaloneLanguageLabel(previousText)
      }
    }

    const lines = codeText.split("\n")
    if (lines.length >= 2) {
      const firstLineHint = getLanguageHintFromLabel(lines[0])
      if (firstLineHint && !looksLikeCodeLine(lines[0]) && looksLikeCodeLine(lines[1])) {
        hint = hint ?? firstLineHint
        codeText = lines.slice(1).join("\n").trim()
      }
    }

    const stripped = stripAttachedLanguagePrefix(codeText)
    codeText = stripped.code.trim()
    hint = stripped.hint ?? hint

    if (!looksLikeCodeBlock(codeText, hint)) {
      continue
    }

    const pre = document.createElement("pre")
    const code = document.createElement("code")
    const language = detectCodeLanguage(codeText, hint)

    code.setAttribute("data-language", language)
    code.className = `language-${language}`
    code.textContent = codeText
    pre.append(code)
    element.replaceWith(pre)

    if (removePreviousLabel && previousSibling?.isConnected) {
      previousSibling.remove()
    }
  }
}

function transformInlineMath(document: Document): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []

  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!(node instanceof Text)) {
      continue
    }

    const parent = node.parentElement
    if (!parent) {
      continue
    }

    if (parent.closest("pre, code, script, style, textarea")) {
      continue
    }

    if (parent.closest(`[${DATA_CONTENT_TYPE_ATTR}="${EQUATION_BLOCK_TYPE}"], [${DATA_INLINE_CONTENT_TYPE_ATTR}="${INLINE_EQUATION_TYPE}"]`)) {
      continue
    }

    textNodes.push(node)
  }

  for (const textNode of textNodes) {
    if (textNode.isConnected) {
      replaceInlineMathTextNode(textNode)
    }
  }
}

export function transformExternalHtmlForEditor(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(html, "text/html")

  transformBlockCandidates(document)
  transformInlineMath(document)

  return document.body.innerHTML
}

export function convertPlainTextToEditorHtml(text: string): string {
  return transformExternalHtmlForEditor(markdownToHTML(normalizeText(text)))
}

interface RichTextBlockParsingEditor {
  tryParseHTMLToBlocks: (html: string) => unknown[]
  tryParseMarkdownToBlocks: (markdown: string) => unknown[]
}

export function parseRichTextToBlocks(editor: RichTextBlockParsingEditor, text: string): unknown[] {
  const normalized = normalizeText(text).trim()
  if (!normalized) {
    return []
  }

  const htmlBlocks = editor.tryParseHTMLToBlocks(convertPlainTextToEditorHtml(normalized))
  if (htmlBlocks.length > 0) {
    return htmlBlocks
  }

  try {
    return editor.tryParseMarkdownToBlocks(normalized)
  } catch {
    return []
  }
}

export function shouldPreferPlainTextPaste(text: string): boolean {
  const normalized = normalizeText(text).trim()
  if (!normalized) {
    return false
  }

  return (
    looksLikeMarkdownOrStructuredText(normalized) ||
    unwrapDisplayMath(normalized) !== undefined ||
    /\\\([\s\S]+\\\)|(^|[^\\])\$(?!\$)[\s\S]+?(^|[^\\])\$/.test(normalized) ||
    looksLikeCodeBlock(normalized)
  )
}

export function getEquationBlockPropsFromElement(element: HTMLElement): { latex: string; displayMode: boolean } | undefined {
  if (element.getAttribute(DATA_CONTENT_TYPE_ATTR) !== EQUATION_BLOCK_TYPE) {
    return undefined
  }

  const latex = element.getAttribute(DATA_LATEX_ATTR)?.trim()
  if (!latex) {
    return undefined
  }

  return {
    latex,
    displayMode: element.getAttribute(DATA_DISPLAY_MODE_ATTR) !== "false",
  }
}

export function getInlineEquationPropsFromElement(element: HTMLElement): { latex: string } | undefined {
  if (element.getAttribute(DATA_INLINE_CONTENT_TYPE_ATTR) !== INLINE_EQUATION_TYPE) {
    return undefined
  }

  const latex = element.getAttribute(DATA_LATEX_ATTR)?.trim()
  if (!latex) {
    return undefined
  }

  return { latex }
}
