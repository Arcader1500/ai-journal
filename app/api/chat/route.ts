export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import {
  embedText,
  retrieveRelevantEntries,
  formatEntriesAsContext,
  userHasEntries,
} from '@/lib/embeddings'

// ─── AI provider detection ────────────────────────────────────────────────────
const hasClaudeKey =
  !!process.env.ANTHROPIC_API_KEY &&
  process.env.ANTHROPIC_API_KEY !== 'sk-ant-...'

const hasGeminiKey = !!process.env.GEMINI_API_KEY

const BASE_SYSTEM_PROMPT = `You are a reflective journaling companion. Your role is to be an honest, non-sycophantic thinking partner. You should:
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

// ─── RAG: build enriched system prompt ───────────────────────────────────────

/**
 * On the first user message of a conversation, retrieves the top-3 most
 * relevant past journal entries and prepends them to the system prompt.
 * Returns the base prompt unchanged if no entries exist or it's not the
 * first message.
 */
async function buildSystemPrompt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  messages: Message[]
): Promise<string> {
  // Only enrich on the first user turn (messages array contains just that one message)
  const isFirstTurn = messages.length === 1

  if (!isFirstTurn) return BASE_SYSTEM_PROMPT

  try {
    const hasEntries = await userHasEntries(supabase, userId)
    if (!hasEntries) return BASE_SYSTEM_PROMPT

    const queryEmbedding = await embedText(messages[0].content)
    const entries = await retrieveRelevantEntries(supabase, userId, queryEmbedding, 3)

    if (entries.length === 0) return BASE_SYSTEM_PROMPT

    const contextBlock = formatEntriesAsContext(entries)
    console.log(`[RAG] Injected ${entries.length} past entr${entries.length === 1 ? 'y' : 'ies'} into system prompt`)

    return `${BASE_SYSTEM_PROMPT}\n\n${contextBlock}`
  } catch (err) {
    // RAG failure must never break the chat
    console.error('[RAG] Failed to build context (non-fatal):', err)
    return BASE_SYSTEM_PROMPT
  }
}

// ─── Claude streaming helper ──────────────────────────────────────────────────
async function streamClaude(
  messages: Message[],
  systemPrompt: string,
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
    system: systemPrompt,
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

// ─── Gemini streaming helper (with tool support) ──────────────────────────────
async function streamGemini(
  messages: Message[],
  systemPrompt: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder
): Promise<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash-preview',
    systemInstruction: systemPrompt,
    tools: [
      {
        functionDeclarations: [
          {
            name: 'search_past_entries',
            description:
              'Search the user\'s past journal entries for relevant context. Call this when the user references something from their past (e.g. a person, situation, or feeling) that you don\'t have context for.',
            parameters: {
              type: SchemaType.OBJECT,
              properties: {
                query: {
                  type: SchemaType.STRING,
                  description: 'A short natural-language description of what to search for, e.g. "anxiety about work" or "relationship with father"',
                },
              },
              required: ['query'],
            },
          },
        ],
      },
    ],
  })

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const lastMessage = messages[messages.length - 1]
  const chat = model.startChat({ history })

  // ── First send ──
  let result = await chat.sendMessageStream(lastMessage.content)

  let fullText = ''

  // Agentic loop: handle potential tool calls before streaming final text
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Collect all chunks from this stream turn
    const parts = []
    for await (const chunk of result.stream) {
      parts.push(chunk)
    }

    // Aggregate the full response for this turn
    const response = await result.response

    // Check for a function call
    const fnCall = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall
    )?.functionCall

    if (fnCall && fnCall.name === 'search_past_entries') {
      const query = (fnCall.args as { query: string }).query
      console.log(`[RAG] Tool call: search_past_entries("${query}")`)

      // Execute the tool
      let toolResultText = 'No relevant past entries found.'
      try {
        const queryEmbedding = await embedText(query)
        const entries = await retrieveRelevantEntries(supabase, userId, queryEmbedding, 3)
        if (entries.length > 0) {
          toolResultText = formatEntriesAsContext(entries)
        }
      } catch (err) {
        console.error('[RAG] Tool execution error:', err)
      }

      // Send tool result back and get the next stream
      result = await chat.sendMessageStream([
        {
          functionResponse: {
            name: 'search_past_entries',
            response: { result: toolResultText },
          },
        },
      ])
      // Loop again to check for another tool call or final text
      continue
    }

    // No tool call — stream all buffered text chunks to client
    for (const chunk of parts) {
      const text = chunk.text()
      if (text) {
        fullText += text
        controller.enqueue(encoder.encode(text))
      }
    }
    break
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

    // 4. Build system prompt (with RAG context on first turn)
    const systemPrompt = await buildSystemPrompt(supabase, user.id, messages)

    // 5. Stream response from whichever provider is available
    const encoder = new TextEncoder()
    let fullResponseText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (hasClaudeKey) {
            console.log('[AI] Using Claude')
            fullResponseText = await streamClaude(messages, systemPrompt, controller, encoder)
          } else {
            console.log('[AI] Falling back to Gemini')
            fullResponseText = await streamGemini(
              messages,
              systemPrompt,
              supabase,
              user.id,
              controller,
              encoder
            )
          }

          controller.close()

          // 6. Persist full conversation to Supabase
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
