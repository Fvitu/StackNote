"use client"

import { Globe, Link2 } from "lucide-react"
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"

function getHostname(url: string): string {  try {
    return new URL(url).hostname.replace(/^www\./i, "")
  } catch {
    return "Website"
  }
}

export const linkPreviewBlockSpec = createReactBlockSpec(
  {
    type: "linkPreview",
    propSchema: {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: "" },
      siteName: { default: "" },
      favicon: { default: "" },
      loading: { default: false, type: "boolean" as const },
      error: { default: "" },
    },
   content: "none",
  },
  {
    render: (props) => {
     const isPreview = !props.editor.isEditable
      const title = props.block.props.title || props.block.props.url || "Link"
      const description = props.block.props.description
      const siteName = props.block.props.siteName || getHostname(props.block.props.url)
      const canOpen = Boolean(props.block.props.url)

      return (
        <BlockContentWrapper
          blockType={props.block.type}
          blockProps={props.block.props}
          propSchema={props.editor.schema.blockSchema.linkPreview.propSchema}
        >
          <a
            href={canOpen ? props.block.props.url : undefined}
            target={isPreview ? undefined : "_blank"}
            rel={isPreview ? undefined : "noreferrer"}
            className="group/linkPreview block w-full overflow-hidden rounded-[var(--sn-radius-lg)] border transition-colors"
            style={{
              borderColor: props.block.props.error ? "rgba(239,68,68,0.4)" : "var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              pointerEvents: isPreview ? "none" : "auto",
            }}
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 shrink-0">
                {props.block.props.favicon && !props.block.props.loading ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={props.block.props.favicon} alt="" className="h-4 w-4 rounded-sm" loading="lazy" draggable={false} />
                ) : (
                  <div className="flex h-4 w-4 items-center justify-center rounded-sm" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    <Globe className="h-3 w-3" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {props.block.props.loading ? "Fetching link preview..." : title}
                </p>

                {description && !props.block.props.loading && (
                  <p className="mt-1 line-clamp-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {description}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  <Link2 className="h-3 w-3" />
                  <span className="truncate">{siteName}</span>
                </div>

                {props.block.props.error && (
                  <p className="mt-1 text-xs" style={{ color: "#fca5a5" }}>
                    {props.block.props.error}
                  </p>
                )}
              </div>

              {props.block.props.image && !props.block.props.loading && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md" style={{ backgroundColor: "var(--bg-hover)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={props.block.props.image} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                </div>
              )}
            </div>
          </a>
        </BlockContentWrapper>
      )
    },
  },
)
