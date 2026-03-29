const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

export const OPENROUTER_AUTO_MODEL = "openrouter/auto"

type OpenRouterMessageRole = "system" | "user" | "assistant"

type OpenRouterTextPart = {
  type: "text"
  text: string
}

type OpenRouterImagePart = {
  type: "image_url"
  image_url: {
    url: string
  }
}

type OpenRouterFilePart = {
  type: "file"
  file: {
    filename: string
    fileData: string
  }
}

export interface OpenRouterMessage {
  role: OpenRouterMessageRole
  content: string | Array<OpenRouterTextPart | OpenRouterImagePart | OpenRouterFilePart>
}

interface OpenRouterResponse {
  model?: string
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  usage?: {
    total_tokens?: number
  }
  error?: {
    message?: string
  }
}

interface CreateOpenRouterChatCompletionOptions {
  messages: OpenRouterMessage[]
  maxTokens: number
  temperature: number
  referer?: string
  title?: string
  plugins?: Array<Record<string, unknown>>
}

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

export async function createOpenRouterChatCompletion({
  messages,
  maxTokens,
  temperature,
  referer,
  title,
  plugins,
}: CreateOpenRouterChatCompletionOptions) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(referer ? { "HTTP-Referer": referer } : {}),
      ...(title ? { "X-OpenRouter-Title": title } : {}),
    },
    body: JSON.stringify({
      model: OPENROUTER_AUTO_MODEL,
      messages,
      plugins,
      max_tokens: maxTokens,
      temperature,
      stream: false,
    }),
  })

  const payload = (await response.json().catch(() => null)) as OpenRouterResponse | null

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      (typeof payload === "object" && payload !== null && "message" in payload
        ? String(payload.message)
        : "OpenRouter request failed")
    throw new Error(message)
  }

  const content = payload?.choices?.[0]?.message?.content ?? ""
  if (!content.trim()) {
    throw new Error("OpenRouter returned an empty response")
  }

  return {
    content,
    model: payload?.model ?? OPENROUTER_AUTO_MODEL,
    totalTokens: payload?.usage?.total_tokens ?? 0,
  }
}
