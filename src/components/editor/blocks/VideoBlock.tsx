"use client"

import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  loom: "Loom",
  vimeo: "Vimeo",
  unknown: "Embed",
}

export const videoEmbedBlockSpec = createReactBlockSpec(
  {
    type: "videoEmbed",
    propSchema: {
      url: { default: "" },
      embedUrl: { default: "" },
      platform: { default: "unknown" },
      title: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const src = props.block.props.embedUrl || props.block.props.url
      const isPreview = usePreviewMode()

      if (isPreview) {
        return (
          <BlockContentWrapper
            blockType={props.block.type}
            blockProps={props.block.props}
            propSchema={props.editor.schema.blockSchema.videoEmbed.propSchema}
          >
            <div className="w-full overflow-hidden rounded-[var(--sn-radius-lg)] border px-4 py-3" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
              <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                {props.block.props.title || PLATFORM_LABELS[props.block.props.platform] || "Embed"}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                Embedded video preview disabled in history.
              </div>
            </div>
          </BlockContentWrapper>
        )
      }

      return (
        <BlockContentWrapper
          blockType={props.block.type}
          blockProps={props.block.props}
          propSchema={props.editor.schema.blockSchema.videoEmbed.propSchema}
        >
          <div className="relative w-full overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "var(--border-default)" }}>
            <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
              <iframe
                src={src}
                title={props.block.props.title || "Embedded video"}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div
              className="absolute right-2 top-2 rounded-[var(--sn-radius-sm)] border px-2 py-0.5 text-[11px]"
              style={{
                borderColor: "var(--border-strong)",
                backgroundColor: "rgba(10,10,10,0.8)",
                color: "var(--text-secondary)",
              }}
            >
              {PLATFORM_LABELS[props.block.props.platform] ?? "Embed"}
            </div>
          </div>
        </BlockContentWrapper>
      )
    },
  },
)
