"use client"

import { Check, Loader2, AlertCircle } from "lucide-react"

interface SaveIndicatorProps {
  status: "idle" | "saving" | "saved" | "error"
}

export function SaveIndicator({ status }: SaveIndicatorProps) {
  if (status === "idle") return null

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {status === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-tertiary)" }}>Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-tertiary)" }}>Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-red-500">Error saving</span>
        </>
      )}
    </div>
  )
}
