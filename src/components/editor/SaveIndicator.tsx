"use client"

import { Check, Loader2, AlertCircle, WifiOff } from "lucide-react"

interface SaveIndicatorProps {
	status: "idle" | "saving" | "saved" | "error" | "offline" | "syncing" | "synced"
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  if (status === "idle") return null

  const mutedColor = "var(--text-tertiary)"

  return (
		<div className="flex items-center gap-1.5 text-xs">
			{status === "saving" && (
				<>
					<Loader2 className="h-3 w-3 animate-spin" style={{ color: mutedColor }} />
					<span style={{ color: mutedColor }}>Saving...</span>
				</>
			)}
			{status === "syncing" && (
				<>
					<Loader2 className="h-3 w-3 animate-spin" style={{ color: mutedColor }} />
					<span style={{ color: mutedColor }}>Syncing…</span>
				</>
			)}
			{status === "saved" && (
				<>
					<Check className="h-3 w-3" style={{ color: mutedColor }} />
					<span style={{ color: mutedColor }}>Saved</span>
				</>
			)}
			{status === "synced" && (
				<>
					<Check className="h-3 w-3" style={{ color: mutedColor }} />
					<span style={{ color: mutedColor }}>Synced</span>
				</>
			)}
			{status === "error" && (
				<>
					<AlertCircle className="h-3 w-3 text-red-500" />
					<span className="text-red-500">Server error while saving</span>
				</>
			)}
			{status === "offline" && (
				<>
					<WifiOff className="h-3 w-3" style={{ color: mutedColor }} />
					<span style={{ color: mutedColor }}>Offline — changes saved locally</span>
				</>
			)}
		</div>
  )
}
