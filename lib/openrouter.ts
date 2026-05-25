/**
 * lib/openrouter.ts
 *
 * Shared helper wrapper for making LLM completion calls and streams through OpenRouter.
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'


export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Makes a non-streaming chat completion request to OpenRouter.
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options?: {
    responseMimeType?: 'application/json' | 'text/plain';
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not defined in environment variables.')
  }

  const model = options?.model || DEFAULT_MODEL
  const responseFormat = options?.responseMimeType === 'application/json' 
    ? { type: 'json_object' } 
    : undefined

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Journal',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
      response_format: responseFormat,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * Handles server-sent events (SSE) streaming from OpenRouter.
 */
export async function streamOpenRouter(
  messages: OpenRouterMessage[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  options?: {
    model?: string;
    temperature?: number;
  }
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not defined in environment variables.')
  }

  const model = options?.model || DEFAULT_MODEL

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Journal',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenRouter API streaming error: ${response.statusText} - ${errorText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body for OpenRouter streaming')

  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += new TextDecoder().decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const cleaned = line.trim()
      if (!cleaned || cleaned === 'data: [DONE]') continue

      if (cleaned.startsWith('data: ')) {
        try {
          const json = JSON.parse(cleaned.substring(6))
          const content = json.choices?.[0]?.delta?.content || ''
          if (content) {
            fullText += content
            controller.enqueue(encoder.encode(content))
          }
        } catch (e) {
          // Ignore parse errors from incomplete chunks
        }
      }
    }
  }

  return fullText
}
