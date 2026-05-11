import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── AI provider detection ────────────────────────────────────────────────────
// Uses Anthropic Claude when ANTHROPIC_API_KEY is set and not a placeholder.
// Falls back to Google Gemini otherwise.
const hasClaudeKey =
  !!process.env.ANTHROPIC_API_KEY &&
  !process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')

const hasGeminiKey = !!process.env.GEMINI_API_KEY

const SYSTEM_PROMPT = `You are a reflective journaling companion. Your role is to be an honest, non-sycophantic thinking partner. You should:
- Validate genuine feelings without inflating them
- Point out what the user handled well AND what they could have done differently
- Ask clarifying questions that deepen self-reflection
- Never tell the user only what they want to hear
- Be warm but honest
- Keep responses concise — aim for 3-5 sentences unless the user needs more depth
- Do not use bullet points or markdown formatting; write in natural prose`

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

// ─── Claude streaming helper ──────────────────────────────────────────────────
async function streamClaude(
  messages: Message[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let fullText = ''
  const claudeMessages = messages.map(({ role, content }) => ({ role, content }))

  const claudeStream = anthropic.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: claudeMessages,
  })

  for await (const chunk of claudeStream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      fullText += chunk.delta.text
      controller.enqueue(encoder.encode(chunk.delta.text))
    }
  }

  return fullText
}

// ─── Gemini streaming helper ──────────────────────────────────────────────────
async function streamGemini(
  messages: Message[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: SYSTEM_PROMPT,
  })

  // Convert to Gemini's history + latest user turn format
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const lastMessage = messages[messages.length - 1]
  const chat = model.startChat({ history })

  let fullText = ''
  const result = await chat.sendMessageStream(lastMessage.content)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    fullText += text
    controller.enqueue(encoder.encode(text))
  }

  return fullText
}

// ─── Route handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse request body
    const body = await request.json()
    const { conversationId, messages } = body as {
      conversationId: string
      messages: Message[]
    }

    if (!conversationId || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // 3. Verify conversation ownership
    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 403 })
    }

    if (!hasClaudeKey && !hasGeminiKey) {
      return NextResponse.json(
        { error: 'No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.' },
        { status: 500 }
      )
    }

    // 4. Stream response from whichever provider is available
    const encoder = new TextEncoder()
    let fullResponseText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (hasClaudeKey) {
            console.log('[AI] Using Claude')
            fullResponseText = await streamClaude(messages, controller, encoder)
          } else {
            console.log('[AI] Falling back to Gemini')
            fullResponseText = await streamGemini(messages, controller, encoder)
          }

          controller.close()

          // 5. Persist full conversation to Supabase
          const assistantMessage: Message = {
            role: 'assistant',
            content: fullResponseText,
            timestamp: new Date().toISOString(),
          }

          await supabase
            .from('conversations')
            .update({ messages: [...messages, assistantMessage] })
            .eq('id', conversationId)
        } catch (err) {
          console.error('Streaming error:', err)
          controller.error(err)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Content-Type-Options': 'nosniff',
        'X-AI-Provider': hasClaudeKey ? 'claude' : 'gemini',
      },
    })
  } catch (err) {
    console.error('Chat API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
