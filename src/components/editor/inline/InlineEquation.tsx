"use client"

import "katex/dist/katex.min.css"

import katex from "katex"
import { createReactInlineContentSpec, InlineContentWrapper } from "@blocknote/react"
import { getInlineEquationPropsFromElement, INLINE_EQUATION_TYPE } from "@/lib/editor-paste"

const inlineEquationPropSchema = {
  latex: { default: "\\alpha" },
} as const

function renderInlineLatex(source: string): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(source || "\\,", {
        displayMode: false,
        throwOnError: true,
      }),
      error: null,
    }
  } catch {
    return {
      html: source,
      error: "Invalid LaTeX",
    }
  }
}

export const inlineEquationSpec = createReactInlineContentSpec(
  {
    type: INLINE_EQUATION_TYPE,
    propSchema: inlineEquationPropSchema,
    content: "none",
  },
  {
    parse: (element) => getInlineEquationPropsFromElement(element),
    render: (props) => {
      const rendered = renderInlineLatex(props.inlineContent.props.latex)

      return (
        <InlineContentWrapper
          inlineContentType={props.inlineContent.type}
          inlineContentProps={props.inlineContent.props}
          propSchema={inlineEquationPropSchema}
        >
          <span
            className="stacknote-inline-equation katex-wrapper"
            contentEditable={false}
            suppressContentEditableWarning
            title={props.editor.isEditable ? "Double-click to edit equation" : undefined}
            onDoubleClick={() => {
              if (!props.editor.isEditable) {
                return
              }

              const nextValue = window.prompt("Edit inline equation", props.inlineContent.props.latex)?.trim()
              if (!nextValue) {
                return
              }

              props.updateInlineContent({
                type: INLINE_EQUATION_TYPE,
                props: {
                  latex: nextValue,
                },
              })
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "1.75em",
              cursor: props.editor.isEditable ? "text" : "default",
            }}
          >
            {rendered.error ? (
              <code style={{ color: "#fca5a5", fontFamily: "var(--font-mono)", fontSize: "0.9em" }}>{props.inlineContent.props.latex}</code>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
            )}
          </span>
        </InlineContentWrapper>
      )
    },
    toExternalHTML: (props) => (
      <span data-inline-content-type={INLINE_EQUATION_TYPE} data-latex={props.inlineContent.props.latex}>
        {`\\(${props.inlineContent.props.latex}\\)`}
      </span>
    ),
  },
)
