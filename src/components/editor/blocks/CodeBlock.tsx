"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Copy } from "lucide-react"
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"
import { detectCodeLanguage } from "@/lib/code-language"
import { SUPPORTED_LANGUAGES } from "@/lib/shiki-theme"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

const DEFAULT_LANGUAGE = "typescript"

function getCodeBlockPropsFromElement(element: HTMLElement) {
  if (element.tagName !== "PRE") {
    return undefined
  }

  const codeElement = element.querySelector(":scope > code")
  if (!codeElement) {
    return undefined
  }

  const code = (codeElement.textContent ?? "").replace(/\r\n?/g, "\n")
  const language = detectCodeLanguage(
    code,
    codeElement.getAttribute("data-language") ?? codeElement.className ?? undefined,
  )

  return {
    code,
    language,
    showLineNumbers: true,
    filename: codeElement.getAttribute("data-filename") ?? element.getAttribute("data-filename") ?? "",
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}

export const codeBlockSpec = createReactBlockSpec(
  {
    type: "codeBlock",
    propSchema: {
      code: { default: "" },
      language: { default: DEFAULT_LANGUAGE },
      showLineNumbers: { default: true, type: "boolean" as const },
      filename: { default: "" },
    },
    content: "none",
  },
  {
    meta: {
      code: true,
      defining: true,
      isolating: false,
    },
    parse: (element) => getCodeBlockPropsFromElement(element),
    render: (props) => {
      const [isEditing, setIsEditing] = useState(false)
      const [codeDraft, setCodeDraft] = useState(props.block.props.code)
      const [highlightedHtml, setHighlightedHtml] = useState<string>("<pre class=\"shiki\"><code></code></pre>")
      const [copied, setCopied] = useState(false)
      const [loading, setLoading] = useState(false)
      const [languageQuery, setLanguageQuery] = useState("")
      const [openLanguageMenu, setOpenLanguageMenu] = useState(false)
      const isPreview = usePreviewMode()

      const codeRef = useRef<HTMLDivElement>(null)
      const menuRef = useRef<HTMLDivElement>(null)

      const selectedLanguage = useMemo(
        () => SUPPORTED_LANGUAGES.find((language) => language.id === props.block.props.language) ?? SUPPORTED_LANGUAGES[0],
        [props.block.props.language],
      )

      const filteredLanguages = useMemo(() => {
        const query = languageQuery.trim().toLowerCase()
        if (!query) return SUPPORTED_LANGUAGES
        return SUPPORTED_LANGUAGES.filter((language) => {
          return language.label.toLowerCase().includes(query) || language.id.toLowerCase().includes(query)
        })
      }, [languageQuery])

      useEffect(() => {
        setCodeDraft(props.block.props.code)
      }, [props.block.props.code])

      const highlightInput = useDebouncedValue(isEditing ? codeDraft : props.block.props.code, 300)

      useEffect(() => {
        let cancelled = false

        const run = async () => {
          setLoading(true)
          try {
            const response = await fetch("/api/highlight", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: highlightInput,
                language: props.block.props.language,
              }),
            })

            const data = (await response.json()) as { html?: string }
            if (!cancelled && data.html) {
              setHighlightedHtml(data.html)
            }
          } finally {
            if (!cancelled) setLoading(false)
          }
        }

        void run()
        return () => {
          cancelled = true
        }
      }, [highlightInput, props.block.props.language])

      useEffect(() => {
        const onClickOutside = (event: MouseEvent) => {
          if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setOpenLanguageMenu(false)
            setLanguageQuery("")
          }

          if (
            isEditing &&
            codeRef.current &&
            !codeRef.current.contains(event.target as Node)
          ) {
            props.editor.updateBlock(props.block, {
              type: "codeBlock",
              props: {
                ...props.block.props,
                code: codeDraft,
              },
            })
            setIsEditing(false)
          }
        }

        document.addEventListener("mousedown", onClickOutside)
        return () => document.removeEventListener("mousedown", onClickOutside)
      }, [codeDraft, isEditing, props])

      const linesCount = Math.max(1, (isEditing ? codeDraft : props.block.props.code).split("\n").length)

      if (isPreview) {
        return (
          <BlockContentWrapper
            blockType={props.block.type}
            blockProps={props.block.props}
            propSchema={props.editor.schema.blockSchema.codeBlock.propSchema}
          >
            <div className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#0a0a0a" }}>
              <div className="flex h-9 items-center justify-between gap-3 px-3" style={{ backgroundColor: "#0f0f0f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <span className="rounded-[3px] px-1 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(124,106,255,0.2)", color: "#c4bcff" }}>
                    {selectedLanguage.icon}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-primary)" }}>
                    {selectedLanguage.label}
                  </span>
                </div>

                <div className="min-w-0 flex-1 truncate text-center text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {props.block.props.filename || ""}
                </div>

                <div className="w-16" />
              </div>

              <div className="flex">
                {props.block.props.showLineNumbers && (
                  <div
                    className="select-none px-3 py-4 text-right text-[13.5px]"
                    style={{ color: "#444", borderRight: "1px solid rgba(255,255,255,0.06)", minWidth: "2.5em", fontFamily: "var(--font-mono)" }}
                  >
                    {Array.from({ length: linesCount }, (_, index) => (
                      <div key={index} className="h-[1.7em] leading-[1.7em]">
                        {index + 1}
                      </div>
                    ))}
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-x-auto px-5 py-4 stacknote-shiki" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
              </div>
            </div>
          </BlockContentWrapper>
        )
      }

      return (
        <BlockContentWrapper
          blockType={props.block.type}
          blockProps={props.block.props}
          propSchema={props.editor.schema.blockSchema.codeBlock.propSchema}
        >
          <div className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "#0a0a0a" }}>
            <div
              className="flex h-9 items-center justify-between gap-3 px-3"
              style={{ backgroundColor: "#0f0f0f", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div ref={menuRef} className="relative flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-[var(--sn-radius-sm)] px-2 py-1 text-xs"
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
                  onClick={() => setOpenLanguageMenu((value) => !value)}
                >
                  <span className="rounded-[3px] px-1 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(124,106,255,0.2)", color: "#c4bcff" }}>
                    {selectedLanguage.icon}
                  </span>
                  <span>{selectedLanguage.label}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {openLanguageMenu && (
                  <div
                    className="absolute left-0 top-9 z-30 w-56 overflow-hidden rounded-[var(--sn-radius-md)] border"
                    style={{ borderColor: "var(--border-strong)", backgroundColor: "#111111", boxShadow: "0 14px 32px rgba(0,0,0,0.4)" }}
                  >
                    <div className="p-2" style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <input
                        value={languageQuery}
                        onChange={(event) => setLanguageQuery(event.target.value)}
                        placeholder="Search language..."
                        className="w-full rounded-[var(--sn-radius-sm)] border px-2 py-1 text-xs outline-none"
                        style={{ borderColor: "var(--border-default)", backgroundColor: "#0a0a0a", color: "var(--text-primary)" }}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {filteredLanguages.map((language) => (
                        <button
                          key={language.id}
                          type="button"
                          className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() => {
                            props.editor.updateBlock(props.block, {
                              type: "codeBlock",
                              props: {
                                ...props.block.props,
                                language: language.id,
                              },
                            })
                            setOpenLanguageMenu(false)
                            setLanguageQuery("")
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span className="rounded-[3px] px-1 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(124,106,255,0.2)", color: "#c4bcff" }}>
                              {language.icon}
                            </span>
                            {language.label}
                          </span>
                          {language.id === props.block.props.language && <Check className="h-3.5 w-3.5" style={{ color: "var(--sn-accent)" }} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 truncate text-center text-xs" style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {props.block.props.filename || ""}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-[var(--sn-radius-sm)] px-2 py-1 text-xs"
                  style={{ color: copied ? "#86efac" : "var(--text-secondary)", backgroundColor: copied ? "rgba(34,197,94,0.2)" : "transparent" }}
                  onClick={async () => {
                    await navigator.clipboard.writeText(props.block.props.code)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    <Copy className="h-3 w-3" />
                    {copied ? "Copied!" : "Copy"}
                  </span>
                </button>
              </div>
            </div>

            <div ref={codeRef} className="relative transition-opacity duration-150" style={{ opacity: loading ? 0.75 : 1 }}>
              {isEditing ? (
                <div>
                  <textarea
                    value={codeDraft}
                    onChange={(event) => setCodeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        props.editor.updateBlock(props.block, {
                          type: "codeBlock",
                          props: {
                            ...props.block.props,
                            code: codeDraft,
                          },
                        })
                        setIsEditing(false)
                      }
                    }}
                    autoFocus
                    className="h-64 w-full resize-y border-none bg-transparent px-5 py-4 text-[13.5px] leading-[1.7] outline-none"
                    style={{ color: "#e8e8e8", fontFamily: "var(--font-mono)", whiteSpace: "pre", overflowX: "auto" }}
                    spellCheck={false}
                  />
                  <div className="border-t px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                    <div className="overflow-x-auto stacknote-shiki" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => setIsEditing(true)}
                >
                  <div className="flex">
                    {props.block.props.showLineNumbers && (
                      <div
                        className="select-none px-3 py-4 text-right text-[13.5px]"
                        style={{ color: "#444", borderRight: "1px solid rgba(255,255,255,0.06)", minWidth: "2.5em", fontFamily: "var(--font-mono)" }}
                      >
                        {Array.from({ length: linesCount }, (_, index) => (
                          <div key={index} className="h-[1.7em] leading-[1.7em]">
                            {index + 1}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 overflow-x-auto px-5 py-4 stacknote-shiki" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                  </div>
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-3 py-1.5 text-[11px]" style={{ color: "var(--text-tertiary)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span>Click to edit</span>
              <button
                type="button"
                className="rounded-[var(--sn-radius-sm)] px-2 py-0.5"
                style={{ color: "var(--text-secondary)" }}
                onClick={() => {
                  props.editor.updateBlock(props.block, {
                    type: "codeBlock",
                    props: {
                      ...props.block.props,
                      showLineNumbers: !props.block.props.showLineNumbers,
                    },
                  })
                }}
              >
                {props.block.props.showLineNumbers ? "Hide line numbers" : "Show line numbers"}
              </button>
            </div>
          </div>
        </BlockContentWrapper>
      )
    },
    toExternalHTML: (props) => (
      <pre data-filename={props.block.props.filename || undefined}>
        <code data-language={props.block.props.language} data-filename={props.block.props.filename || undefined} className={`language-${props.block.props.language}`}>
          {props.block.props.code}
        </code>
      </pre>
    ),
  },
)
