/* eslint-disable react-hooks/rules-of-hooks */

"use client"

import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react"
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  loom: "Loom",
  vimeo: "Vimeo",
  unknown: "Embed",
}

const MIN_WIDTH_PERCENT = 35
const MAX_WIDTH_PERCENT = 100

type ResizeState = {
  direction: "left" | "right"
  startX: number
  startWidthPx: number
  parentWidthPx: number
}

function clampWidth(value: number) {
  return Math.min(MAX_WIDTH_PERCENT, Math.max(MIN_WIDTH_PERCENT, Math.round(value)))
}

export const videoEmbedBlockSpec = createReactBlockSpec(
  {
    type: "videoEmbed",
    propSchema: {
      url: { default: "" },
      embedUrl: { default: "" },
      platform: { default: "unknown" },
      title: { default: "" },
      width: { default: 100, type: "number" as const },
    },
    content: "none",
  },
  {
    render: (props) => {
      const src = props.block.props.embedUrl || props.block.props.url
      const isPreview = usePreviewMode()
      const wrapperRef = useRef<HTMLDivElement | null>(null)
      const resizeStateRef = useRef<ResizeState | null>(null)
      const normalizedStoredWidth = typeof props.block.props.width === "number" ? props.block.props.width : 100
      const latestWidthRef = useRef(clampWidth(normalizedStoredWidth))

      const width = useMemo(() => clampWidth(normalizedStoredWidth), [normalizedStoredWidth])

      useEffect(() => {
        latestWidthRef.current = width
      }, [width])

      const commitWidth = useCallback(
        (nextWidth: number) => {
          const normalizedWidth = clampWidth(nextWidth)
          if (normalizedWidth === latestWidthRef.current) {
            return
          }

          latestWidthRef.current = normalizedWidth
          props.editor.updateBlock(props.block, {
            type: "videoEmbed",
            props: {
              ...props.block.props,
              width: normalizedWidth,
            },
          })
        },
        [props],
      )

      useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
          const resizeState = resizeStateRef.current
          if (!resizeState) {
            return
          }

          const deltaX =
            resizeState.direction === "right"
              ? event.clientX - resizeState.startX
              : resizeState.startX - event.clientX
          const nextWidthPx = resizeState.startWidthPx + deltaX
          const nextWidthPercent = (nextWidthPx / resizeState.parentWidthPx) * 100
          commitWidth(nextWidthPercent)
        }

        const stopResizing = () => {
          resizeStateRef.current = null
          document.body.style.cursor = ""
          document.body.style.userSelect = ""
        }

        window.addEventListener("pointermove", handlePointerMove)
        window.addEventListener("pointerup", stopResizing)
        window.addEventListener("pointercancel", stopResizing)

        return () => {
          window.removeEventListener("pointermove", handlePointerMove)
          window.removeEventListener("pointerup", stopResizing)
          window.removeEventListener("pointercancel", stopResizing)
        }
      }, [commitWidth])

      const handleResizeStart = useCallback(
        (direction: ResizeState["direction"]) => (event: ReactPointerEvent<HTMLButtonElement>) => {
          const wrapper = wrapperRef.current
          const parent = wrapper?.parentElement
          if (!wrapper || !parent) {
            return
          }

          event.preventDefault()
          event.stopPropagation()

          resizeStateRef.current = {
            direction,
            startX: event.clientX,
            startWidthPx: wrapper.getBoundingClientRect().width,
            parentWidthPx: parent.getBoundingClientRect().width,
          }

          document.body.style.cursor = "ew-resize"
          document.body.style.userSelect = "none"
        },
        [],
      )

      const wrapperStyle = {
        width: `${width}%`,
        maxWidth: "100%",
        minWidth: "min(320px, 100%)",
        marginInline: "auto",
      } as const

      if (isPreview) {
        return (
          <BlockContentWrapper
            blockType={props.block.type}
            blockProps={props.block.props}
            propSchema={props.editor.schema.blockSchema.videoEmbed.propSchema}
          >
            <div
              className="overflow-hidden rounded-[var(--sn-radius-lg)] border px-4 py-3"
              style={{ ...wrapperStyle, borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
            >
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
          <div ref={wrapperRef} className="relative" style={wrapperStyle}>
            <div className="overflow-hidden rounded-[var(--sn-radius-lg)] border" style={{ borderColor: "var(--border-default)" }}>
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

            {(["left", "right"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                onPointerDown={handleResizeStart(direction)}
                className={`absolute inset-y-3 z-10 flex w-5 items-center justify-center ${direction === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
                style={{ cursor: "ew-resize", touchAction: "none" }}
                aria-label={`Resize embedded video from the ${direction} edge`}
                title="Drag edge to resize"
              >
                <span
                  className="h-12 w-1.5 rounded-full border transition-colors"
                  style={{
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(10,10,10,0.82)",
                  }}
                />
              </button>
            ))}
          </div>
        </BlockContentWrapper>
      )
    },
  },
)
