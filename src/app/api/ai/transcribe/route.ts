import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { groq } from "@/lib/groq"
import { prisma } from "@/lib/prisma"
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit"
import { AI_LIMITS } from "@/lib/ai-limits"
import { resolveSttModel } from "@/lib/groq-models"

export const maxDuration = 120

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

interface VerboseTranscriptionResponse {
  text: string
  duration?: number
  language?: string
  segments?: TranscriptSegment[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }


  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 })
  }

  const audioFile = formData.get("audio") as File | null
  const noteId = formData.get("noteId") as string | null
  const noteTitle = formData.get("noteTitle") as string | null
  const language = formData.get("language") as string | null

  if (!audioFile) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 })
  }

  // Validate file size
  const fileSizeMB = audioFile.size / (1024 * 1024)
  if (fileSizeMB > AI_LIMITS.MAX_AUDIO_FILE_MB) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is ${AI_LIMITS.MAX_AUDIO_FILE_MB}MB`,
        maxSizeMB: AI_LIMITS.MAX_AUDIO_FILE_MB,
      },
      { status: 400 }
    )
  }

  // Validate file type
  const validTypes = [
    "audio/mp3",
    "audio/mpeg",
    "audio/mpga",
    "audio/m4a",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "video/mp4",
    "video/mpeg",
    "video/webm",
  ]
  if (!validTypes.some((t) => audioFile.type.includes(t.split("/")[1]))) {
    return NextResponse.json(
      {
        error: "Unsupported audio format",
        supportedFormats: ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg"],
      },
      { status: 400 }
    )
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })
  const sttModel = resolveSttModel(undefined, settings?.preferredSttModel)

  const quotaCheck = await checkQuotaLimit(session.user.id, {
    category: "voice",
    model: sttModel,
    requests: 1,
    audioSeconds: 1,
  })
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      {
        error: quotaCheck.error ?? "Voice transcription limit reached",
        model: sttModel,
        resetAt: quotaCheck.resetAt,
      },
      { status: 429 }
    )
  }

  try {
    // Call Groq Whisper API
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: sttModel,
      language: language ?? undefined,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    }) as unknown as VerboseTranscriptionResponse

    // Extract segments
    const segments: TranscriptSegment[] = (
      transcription.segments ?? []
    ).map((seg: { start: number; end: number; text: string }) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }))

    // Calculate actual duration
    const duration = transcription.duration ?? 0
    const durationSeconds = Math.max(0, Math.ceil(duration))

    const projectedQuota = await checkQuotaLimit(session.user.id, {
      category: "voice",
      model: sttModel,
      requests: 1,
      audioSeconds: durationSeconds,
    })
    const appliedQuota = await recordQuotaUsage(session.user.id, {
      category: "voice",
      model: sttModel,
      requests: 1,
      audioSeconds: durationSeconds,
    })

    if (!projectedQuota.allowed || !appliedQuota.allowed) {
      return NextResponse.json(
        {
          error: projectedQuota.error ?? appliedQuota.error ?? "Voice transcription limit reached",
          model: sttModel,
          resetAt: projectedQuota.resetAt ?? appliedQuota.resetAt,
        },
        { status: 429 }
      )
    }

    return NextResponse.json({
      transcript: transcription.text,
      segments,
      duration,
      language: transcription.language ?? language ?? "auto",
      model: sttModel,
      noteId,
      noteTitle,
    })
  } catch (error) {
    console.error("Transcription error:", error)
    return NextResponse.json(
      { error: "Transcription failed", message: String(error) },
      { status: 500 }
    )
  }
}
