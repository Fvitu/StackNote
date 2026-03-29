"use client"

import { useEffect, useMemo, useState } from "react"
import { formatDurationSeconds } from "@/lib/ai-limits"
import { formatUsageResetCountdown } from "@/lib/ai-usage"
import { readJsonResponse } from "@/lib/http"
import { subscribeToAiUsageChanges } from "@/lib/ai-usage-events"

interface CounterStat {
  used: number
  limit: number
  remaining: number
}

interface UsageModelStats {
  category: "text" | "flashcard" | "voice"
  model: string
  label: string
  windowStartedAt: string | null
  resetAt: string | null
  requests: CounterStat
  tokens?: CounterStat
  flashcards?: CounterStat
  audioSeconds?: CounterStat
}

interface UsageStats {
  textModels: UsageModelStats[]
  flashcardModels: UsageModelStats[]
  voiceModels: UsageModelStats[]
}

interface UsageIndicatorProps {
  model: string
  category?: "text" | "flashcard" | "voice"
  variant?: "compact" | "detailed"
}

export function UsageIndicator({ model, category = "text", variant = "compact" }: UsageIndicatorProps) {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/ai/usage")
        const data = await readJsonResponse<UsageStats>(response)
        if (response.ok && data) {
          setStats(data)
        }
      } catch (error) {
        console.error("Failed to fetch usage:", error)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchUsage()

    const interval = setInterval(() => {
      void fetchUsage()
    }, 30000)
    const unsubscribe = subscribeToAiUsageChanges(() => {
      void fetchUsage()
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  const modelUsage = useMemo(
    () => {
      if (!stats) {
        return null
      }

      const models =
        category === "voice"
          ? stats.voiceModels
          : category === "flashcard"
            ? stats.flashcardModels
            : stats.textModels

      return models.find((entry) => entry.model === model) ?? null
    },
    [category, model, stats],
  )

  if (isLoading || !modelUsage) {
    if (variant === "detailed") {
      return (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.02)",
            color: "var(--text-secondary)",
          }}
        >
          Loading quota...
        </div>
      )
    }

    return (
      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        ...
      </div>
    )
  }

  const requestPercentage = modelUsage.requests.limit > 0 ? modelUsage.requests.used / modelUsage.requests.limit : 0
  const tokenPercentage =
    modelUsage.tokens && modelUsage.tokens.limit > 0 ? modelUsage.tokens.used / modelUsage.tokens.limit : 0
  const flashcardPercentage =
    modelUsage.flashcards && modelUsage.flashcards.limit > 0 ? modelUsage.flashcards.used / modelUsage.flashcards.limit : 0
  const audioPercentage =
    modelUsage.audioSeconds && modelUsage.audioSeconds.limit > 0 ? modelUsage.audioSeconds.used / modelUsage.audioSeconds.limit : 0
  const percentage = Math.max(requestPercentage, tokenPercentage, flashcardPercentage, audioPercentage)
  const isNearLimit = percentage >= 0.8
  const countdown = modelUsage.resetAt ? formatUsageResetCountdown(modelUsage.resetAt, now) : null
  const secondaryMetric = modelUsage.tokens ?? modelUsage.flashcards ?? modelUsage.audioSeconds ?? null
  const secondaryLabel = modelUsage.tokens
    ? "tokens"
    : modelUsage.flashcards
      ? "flashcards"
      : modelUsage.audioSeconds
        ? "audio"
        : null
  const secondaryRemaining = modelUsage.audioSeconds
    ? formatDurationSeconds(modelUsage.audioSeconds.remaining)
    : secondaryMetric
      ? secondaryMetric.remaining.toLocaleString()
      : null
  const title = `${modelUsage.label}: ${modelUsage.requests.remaining} requests remaining${
    secondaryMetric && secondaryLabel && secondaryRemaining ? `, ${secondaryRemaining} ${secondaryLabel} remaining` : ""
  }`

  if (variant === "detailed") {
    return (
      <div
        className="rounded-2xl border px-4 py-3"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
        title={title}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
              Quota
            </p>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {modelUsage.label}
            </p>
          </div>
          {countdown ? (
            <span
              className="shrink-0 rounded-full border px-2 py-1 text-[11px]"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              {countdown}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--bg-hover)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(percentage * 100, 100)}%`,
                backgroundColor: isNearLimit ? "#ef4444" : "var(--sn-accent)",
              }}
            />
          </div>
          <span className="text-sm font-semibold" style={{ color: isNearLimit ? "#f87171" : "var(--text-primary)" }}>
            {modelUsage.requests.remaining}
          </span>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            requests left
          </span>
        </div>

        {secondaryMetric && secondaryLabel && secondaryRemaining ? (
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {secondaryRemaining} {secondaryLabel} available in this 24-hour window
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      style={{ color: isNearLimit ? "#ef4444" : "var(--text-tertiary)" }}
      title={title}
    >
      <div
        className="h-1.5 w-12 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--bg-hover)" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${Math.min(percentage * 100, 100)}%`,
            backgroundColor: isNearLimit ? "#ef4444" : "var(--sn-accent)",
          }}
        />
      </div>
      <span>
        {modelUsage.requests.used}/{modelUsage.requests.limit}
      </span>
      {countdown ? <span>{countdown}</span> : null}
    </div>
  )
}
