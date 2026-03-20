"use client"

import { useState } from "react"
import { FileText, Eye, ExternalLink } from "lucide-react"
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

export const pdfMediaBlockSpec = createReactBlockSpec(
  {
    type: "pdfMedia",
    propSchema: {
      url: { default: "" },
      fileId: { default: "" },
      filename: { default: "" },
      fileSize: { default: "" },
      pageCount: { default: undefined, type: "number" as const },
      uploading: { default: false, type: "boolean" as const },
      progress: { default: 0, type: "number" as const },
      error: { default: "" },
    },
    content: "none",
  },
  {
    meta: {
      fileBlockAccept: ["application/pdf"],
    },
    render: (props) => {
      const [showPreview, setShowPreview] = useState(false)
      const isPreview = usePreviewMode()

      if (isPreview) {
        return (
          <BlockContentWrapper
            blockType={props.block.type}
            blockProps={props.block.props}
            propSchema={props.editor.schema.blockSchema.pdfMedia.propSchema}
          >
            <div className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "var(--border-default)" }}>
              <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: "var(--bg-surface)" }}>
                <FileText className="h-5 w-5 shrink-0" style={{ color: "#ef4444" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {props.block.props.filename || "PDF document"}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                    {props.block.props.pageCount
                      ? `${props.block.props.pageCount} pages`
                      : props.block.props.fileSize || "Portable Document Format"}
                  </p>
                </div>
              </div>
            </div>
          </BlockContentWrapper>
        )
      }

      return (
        <BlockContentWrapper
          blockType={props.block.type}
          blockProps={props.block.props}
          propSchema={props.editor.schema.blockSchema.pdfMedia.propSchema}
        >
          <div className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "var(--border-default)" }}>
            <div
              className="flex items-center justify-between gap-4 px-4 py-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderBottom: showPreview ? "1px solid var(--border-default)" : "none",
              }}
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0" style={{ color: "#ef4444" }} />
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {props.block.props.filename || "PDF document"}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                    {props.block.props.pageCount
                      ? `${props.block.props.pageCount} pages`
                      : props.block.props.fileSize || "Portable Document Format"}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 py-1 text-xs"
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}
                  onClick={() => setShowPreview((value) => !value)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreview ? "Hide" : "Preview"}
                </button>

                <a
                  href={props.block.props.url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 py-1 text-xs"
                  style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open PDF
                </a>
              </div>
            </div>

            {showPreview && props.block.props.url && (
              <iframe src={props.block.props.url} title={props.block.props.filename || "PDF preview"} className="w-full" style={{ height: 600 }} />
            )}
          </div>
        </BlockContentWrapper>
      )
    },
  },
)
