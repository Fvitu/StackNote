"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Play, Pause, Volume2, VolumeX } from "lucide-react"
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react"
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext"

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export const audioMediaBlockSpec = createReactBlockSpec(
  {
    type: "audioMedia",
    propSchema: {
      url: { default: "" },
      fileId: { default: "" },
      filename: { default: "" },
      duration: { default: undefined, type: "number" as const },
      uploading: { default: false, type: "boolean" as const },
      progress: { default: 0, type: "number" as const },
      error: { default: "" },
    },
    content: "none",
  },
  {
    meta: {
      fileBlockAccept: ["audio/*"],
    },
    render: (props) => {
      const audioRef = useRef<HTMLAudioElement>(null)
      const [isPlaying, setIsPlaying] = useState(false)
      const [currentTime, setCurrentTime] = useState(0)
      const [duration, setDuration] = useState(props.block.props.duration ?? 0)
      const [volume, setVolume] = useState(0.8)
      const [showVolume, setShowVolume] = useState(false)
      const isPreview = usePreviewMode()

      if (isPreview) {
        return (
          <BlockContentWrapper
            blockType={props.block.type}
            blockProps={props.block.props}
            propSchema={props.editor.schema.blockSchema.audioMedia.propSchema}
          >
            <div className="flex w-full items-center gap-3 rounded-[var(--sn-radius-lg)] border px-3 py-3" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}>
                <Play className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                  {props.block.props.filename || "Audio"}
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
              </div>

              <div className="w-20 shrink-0 text-right text-xs" style={{ color: "var(--text-secondary)" }}>
                0:00 / {formatSeconds(duration)}
              </div>
            </div>
          </BlockContentWrapper>
        )
      }

      useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const onTimeUpdate = () => setCurrentTime(audio.currentTime)
        const onLoaded = () => {
          setDuration(audio.duration)
          props.editor.updateBlock(props.block, {
            type: "audioMedia",
            props: {
              ...props.block.props,
              duration: Number.isFinite(audio.duration) ? audio.duration : undefined,
            },
          })
        }
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)
        const onEnded = () => setIsPlaying(false)

        audio.addEventListener("timeupdate", onTimeUpdate)
        audio.addEventListener("loadedmetadata", onLoaded)
        audio.addEventListener("play", onPlay)
        audio.addEventListener("pause", onPause)
        audio.addEventListener("ended", onEnded)

        return () => {
          audio.removeEventListener("timeupdate", onTimeUpdate)
          audio.removeEventListener("loadedmetadata", onLoaded)
          audio.removeEventListener("play", onPlay)
          audio.removeEventListener("pause", onPause)
          audio.removeEventListener("ended", onEnded)
        }
      }, [props])

      const progress = useMemo(() => {
        if (!duration) return 0
        return Math.min(100, (currentTime / duration) * 100)
      }, [currentTime, duration])

      const togglePlayback = async () => {
        const audio = audioRef.current
        if (!audio) return

        if (audio.paused) {
          await audio.play()
        } else {
          audio.pause()
        }
      }

      return (
        <BlockContentWrapper
          blockType={props.block.type}
          blockProps={props.block.props}
          propSchema={props.editor.schema.blockSchema.audioMedia.propSchema}
        >
          <div
            className="group flex w-full items-center gap-3 rounded-[var(--sn-radius-lg)] border px-3 py-3"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
            onMouseEnter={() => setShowVolume(true)}
            onMouseLeave={() => setShowVolume(false)}
          >
            <audio ref={audioRef} src={props.block.props.url} preload="metadata" />

            <button
              type="button"
              onClick={togglePlayback}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-1 truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                {props.block.props.filename || "Audio"}
              </div>
              <div className="relative h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    setCurrentTime(next)
                    if (audioRef.current) audioRef.current.currentTime = next
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
            </div>

            <div className="w-20 shrink-0 text-right text-xs" style={{ color: "var(--text-secondary)" }}>
              {formatSeconds(currentTime)} / {formatSeconds(duration)}
            </div>

            <div className={`flex items-center gap-2 overflow-hidden transition-all duration-150 ${showVolume ? "w-24 opacity-100" : "w-0 opacity-0"}`}>
              {volume === 0 ? <VolumeX className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} /> : <Volume2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setVolume(next)
                  if (audioRef.current) audioRef.current.volume = next
                }}
                className="h-1.5 w-16 cursor-pointer appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, var(--sn-accent) ${Math.round(volume * 100)}%, rgba(255,255,255,0.08) ${Math.round(volume * 100)}%)`,
                }}
              />
            </div>
          </div>
        </BlockContentWrapper>
      )
    },
  },
)
