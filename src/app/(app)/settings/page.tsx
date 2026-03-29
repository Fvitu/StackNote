"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Sparkles, Mic } from "lucide-react"
import { TEXT_MODELS, STT_MODELS } from "@/lib/groq-models"
import {
  FLASHCARD_MODEL_LIMITS,
  STT_MODEL_LIMITS,
  TEXT_MODEL_LIMITS,
  formatDurationSeconds,
} from "@/lib/ai-limits"
import { formatUsageResetCountdown } from "@/lib/ai-usage"
import { readJsonResponse } from "@/lib/http"
import { subscribeToAiUsageChanges } from "@/lib/ai-usage-events"

interface UsageStats {
  textModels: UsageModelStats[]
  flashcardModels: UsageModelStats[]
  voiceModels: UsageModelStats[]
}

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

interface UserSettings {
  preferredTextModel: string
  preferredSttModel: string
}

function metricPercentage(metric: CounterStat) {
  return metric.limit > 0 ? (metric.used / metric.limit) * 100 : 0
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    preferredTextModel: "openai/gpt-oss-120b",
    preferredSttModel: "whisper-large-v3",
  })
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Fetch settings on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch("/api/settings")
        const data = await readJsonResponse<UserSettings>(response)
        if (response.ok && data) {
          setSettings(data)
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error)
      } finally {
        setLoadingSettings(false)
      }
    }
    fetchSettings()
  }, [])

  // Fetch usage stats on mount
  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/ai/usage")
        const data = await readJsonResponse<UsageStats>(response)
        if (response.ok && data) {
          setUsage(data)
        }
      } catch (error) {
        console.error("Failed to fetch usage:", error)
      } finally {
        setLoadingUsage(false)
      }
    }
    fetchUsage()
    const interval = window.setInterval(() => {
      void fetchUsage()
    }, 30000)

    const unsubscribe = subscribeToAiUsageChanges(() => {
      void fetchUsage()
    })

    return () => {
      window.clearInterval(interval)
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

  const handleSave = async (field: keyof UserSettings, value: string) => {
    setSaving(true)
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (response.ok) {
        setSettings((prev) => ({ ...prev, [field]: value }))
      }
    } catch (error) {
      console.error("Failed to save settings:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {/* Header */}
      <div
        className="flex h-12 shrink-0 items-center gap-3 border-b px-6"
        style={{ borderColor: "var(--border-default)" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-[#1a1a1a]"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <h1
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Settings
        </h1>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        {/* AI Section */}
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: "var(--sn-accent)" }} />
            <h2
              className="text-base font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              AI Settings
            </h2>
          </div>

          {/* Text Model */}
          <div
            className="mb-4 rounded-lg border p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <label
              className="mb-2 block text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Preferred Text Model
            </label>
            <p
              className="mb-3 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              The AI model used for chat and text generation
            </p>
            <select
              value={settings.preferredTextModel}
              onChange={(e) => handleSave("preferredTextModel", e.target.value)}
              disabled={loadingSettings || saving}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              {TEXT_MODELS.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  style={{ backgroundColor: "var(--bg-surface)" }}
                >
                  {model.name} {model.default ? "(Default)" : ""}
                </option>
              ))}
            </select>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              {TEXT_MODELS.find((m) => m.id === settings.preferredTextModel)?.description}
            </p>
          </div>

          {/* STT Model */}
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <label
              className="mb-2 flex items-center gap-2 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              <Mic className="h-4 w-4" />
              Preferred Transcription Model
            </label>
            <p
              className="mb-3 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              Audio transcription uses your selected Whisper model
            </p>
            <select
              value={settings.preferredSttModel}
              onChange={(e) => handleSave("preferredSttModel", e.target.value)}
              disabled={loadingSettings || saving}
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
              style={{
                borderColor: "var(--border-default)",
                color: "var(--text-primary)",
              }}
            >
              {STT_MODELS.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  style={{ backgroundColor: "var(--bg-surface)" }}
                >
                  {model.name} {model.default ? "(Default)" : ""}
                </option>
              ))}
            </select>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              {STT_MODELS.find((m) => m.id === settings.preferredSttModel)?.description}
            </p>
          </div>
        </section>

        {/* Usage Stats */}
        <section>
          <h2
            className="mb-4 text-base font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            24-Hour Usage
          </h2>

          {loadingUsage ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Loading usage stats...
            </p>
          ) : usage ? (
            <div className="space-y-4">
              {[
                { title: "Text Models", items: usage.textModels, metricLabel: "Tokens" as const },
                { title: "Flashcard Models", items: usage.flashcardModels, metricLabel: "Flashcards" as const },
                { title: "Voice Models", items: usage.voiceModels, metricLabel: "Audio" as const },
              ].map((group) => (
                <div
                  key={group.title}
                  className="rounded-lg border p-4"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-default)",
                  }}
                >
                  <h3 className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {group.title}
                  </h3>
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const secondaryMetric = item.tokens ?? item.flashcards ?? item.audioSeconds ?? null
                      const secondaryLabel =
                        item.tokens ? "Tokens" : item.flashcards ? "Flashcards" : item.audioSeconds ? "Audio" : null

                      return (
                        <div key={item.model} className="rounded-md border p-3" style={{ borderColor: "var(--border-default)" }}>
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                                {item.label}
                              </p>
                              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                {item.resetAt
                                  ? `Window resets in ${formatUsageResetCountdown(item.resetAt, now)}`
                                  : "Window starts on the first request."}
                              </p>
                            </div>
                            <div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
                              <div>
                                Requests: {item.requests.used} / {item.requests.limit}
                              </div>
                              {item.tokens ? (
                                <div>
                                  Tokens: {item.tokens.used.toLocaleString()} / {item.tokens.limit.toLocaleString()}
                                </div>
                              ) : null}
                              {item.flashcards ? (
                                <div>
                                  Flashcards: {item.flashcards.used} / {item.flashcards.limit}
                                </div>
                              ) : null}
                              {item.audioSeconds ? (
                                <div>
                                  Audio: {formatDurationSeconds(item.audioSeconds.used)} / {formatDurationSeconds(item.audioSeconds.limit)}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <div className="mb-1 flex items-center justify-between text-xs">
                                <span style={{ color: "var(--text-secondary)" }}>Requests</span>
                                <span style={{ color: "var(--text-primary)" }}>
                                  {item.requests.used} / {item.requests.limit}
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-hover)" }}>
                                <div
                                  className="h-full transition-all"
                                  style={{
                                    width: `${metricPercentage(item.requests)}%`,
                                    backgroundColor: "var(--sn-accent)",
                                  }}
                                />
                              </div>
                            </div>

                            {secondaryMetric && secondaryLabel ? (
                              <div>
                                <div className="mb-1 flex items-center justify-between text-xs">
                                  <span style={{ color: "var(--text-secondary)" }}>{secondaryLabel}</span>
                                  <span style={{ color: "var(--text-primary)" }}>
                                    {item.tokens
                                      ? `${secondaryMetric.used.toLocaleString()} / ${secondaryMetric.limit.toLocaleString()}`
                                      : item.flashcards
                                        ? `${secondaryMetric.used} / ${secondaryMetric.limit}`
                                        : `${formatDurationSeconds(secondaryMetric.used)} / ${formatDurationSeconds(secondaryMetric.limit)}`}
                                  </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--bg-hover)" }}>
                                  <div
                                    className="h-full transition-all"
                                    style={{
                                      width: `${metricPercentage(secondaryMetric)}%`,
                                      backgroundColor: "var(--sn-accent)",
                                    }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Failed to load usage stats
            </p>
          )}
        </section>

        {/* Daily Limits Info */}
        <section className="mt-8">
          <h2
            className="mb-4 text-base font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            Daily Limits
          </h2>
          <div
            className="rounded-lg border p-4"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}
          >
            <div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
              <div>
                <p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
                  Text models
                </p>
                <div className="space-y-1">
                  {Object.entries(TEXT_MODEL_LIMITS).map(([modelId, limit]) => (
                    <p key={modelId}>
                      <strong style={{ color: "var(--text-primary)" }}>{limit.label}</strong>: {limit.requestsPerWindow} requests and{" "}
                      {limit.tokensPerWindow.toLocaleString()} tokens
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
                  Flashcard models
                </p>
                <div className="space-y-1">
                  {Object.entries(FLASHCARD_MODEL_LIMITS).map(([modelId, limit]) => (
                    <p key={modelId}>
                      <strong style={{ color: "var(--text-primary)" }}>{limit.label}</strong>: {limit.requestsPerWindow} requests and{" "}
                      {limit.flashcardsPerWindow} flashcards
                    </p>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
                  Voice models
                </p>
                <div className="space-y-1">
                  {Object.entries(STT_MODEL_LIMITS).map(([modelId, limit]) => (
                    <p key={modelId}>
                      <strong style={{ color: "var(--text-primary)" }}>{limit.label}</strong>: {limit.requestsPerWindow} requests and{" "}
                      {formatDurationSeconds(limit.audioSecondsPerWindow)} of audio
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Each model uses its own rolling 24-hour window. The countdown starts when you make the first request for that model.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
