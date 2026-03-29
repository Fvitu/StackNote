import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { groq } from "@/lib/groq"
import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit"
import { checkQuotaLimit, recordQuotaUsage } from "@/lib/rate-limit"
import { resolveTextModel } from "@/lib/groq-models"

export const maxDuration = 30

type ActionType = "summarize" | "expand" | "fix" | "translate" | "simplify" | "quiz"

interface ActionRequest {
  action: ActionType
  selectedText: string
  noteTitle?: string
  targetLanguage?: string
  model?: string
}

const ACTION_PROMPTS: Record<ActionType, string | ((lang?: string) => string)> = {
  summarize:
    "Summarize the following text concisely in bullet points. Keep key terms and main ideas. Return only the summary, no introduction.",
  expand:
    "Expand the following note snippet with more detail, examples, and explanations. Maintain the same tone and style. Return only the expanded content.",
  fix: "Fix grammar, spelling, punctuation, and clarity in the following text. Return only the corrected text with no explanation or additional commentary.",
  translate: (lang?: string) =>
    `Translate the following text to ${lang ?? "English"}. Return only the translation, no explanation.`,
  simplify:
    "Rewrite this text for a beginner student. Use simpler language, shorter sentences, and helpful analogies. Return only the simplified text.",
  quiz: "Generate 3 short-answer questions based on this text to test comprehension. Format each question on its own line starting with a number. Focus on key concepts.",
}

function getPromptForAction(action: ActionType, targetLanguage?: string): string {
  const prompt = ACTION_PROMPTS[action]
  if (typeof prompt === "function") {
    return prompt(targetLanguage)
  }
  return prompt
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDbReady(prisma)

  let body: ActionRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { action, selectedText, noteTitle, targetLanguage, model } = body

  if (!action || !Object.keys(ACTION_PROMPTS).includes(action)) {
    return NextResponse.json(
      { error: "Invalid action", validActions: Object.keys(ACTION_PROMPTS) },
      { status: 400 }
    )
  }

  if (!selectedText || typeof selectedText !== "string" || !selectedText.trim()) {
    return NextResponse.json({ error: "Selected text is required" }, { status: 400 })
  }

  if (action === "translate" && !targetLanguage) {
    return NextResponse.json(
      { error: "Target language is required for translate action" },
      { status: 400 }
    )
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  })
  const selectedModel = resolveTextModel(model, settings?.preferredTextModel)

  const quotaCheck = await checkQuotaLimit(session.user.id, {
    category: "text",
    model: selectedModel,
    requests: 1,
    tokens: 1,
  })
  if (!quotaCheck.allowed) {
    return NextResponse.json(
      {
        error: quotaCheck.error ?? "Text model limit reached",
        model: selectedModel,
        resetAt: quotaCheck.resetAt,
      },
      { status: 429 }
    )
  }

  const systemPrompt = getPromptForAction(action, targetLanguage)
  const contextInfo = noteTitle ? `\n\nContext: This text is from a note titled "${noteTitle}".` : ""

  try {
    const completion = await groq.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: systemPrompt + contextInfo,
        },
        {
          role: "user",
          content: selectedText,
        },
      ],
      max_tokens: 1500,
      temperature: action === "fix" ? 0.2 : 0.5, // Lower temperature for fix action
    })

    const result = completion.choices[0]?.message?.content ?? ""
    const tokensUsed = completion.usage?.total_tokens ?? 0

    // Update usage
    await recordQuotaUsage(session.user.id, {
      category: "text",
      model: selectedModel,
      requests: 1,
      tokens: tokensUsed,
    })

    return NextResponse.json({
      result,
      tokensUsed,
      action,
    })
  } catch (error) {
    console.error("AI action error:", error)
    return NextResponse.json(
      { error: "AI service unavailable", message: String(error) },
      { status: 500 }
    )
  }
}
