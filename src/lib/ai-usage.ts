function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function getUsageResetRemaining(resetAt: string, now = Date.now()) {
  const resetTime = new Date(resetAt).getTime()
  if (!Number.isFinite(resetTime)) {
    return {
      totalMs: 0,
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }
  }

  const totalMs = Math.max(0, resetTime - now)
  const totalSeconds = Math.floor(totalMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return {
    totalMs,
    totalSeconds,
    hours,
    minutes,
    seconds,
  }
}

export function formatUsageResetCountdown(resetAt: string, now = Date.now()) {
  const remaining = getUsageResetRemaining(resetAt, now)
  return `${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`
}
