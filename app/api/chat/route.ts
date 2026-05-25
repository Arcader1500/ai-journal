export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { streamOpenRouter, OpenRouterMessage } from '@/lib/openrouter'
import {
  embedText,
  retrieveRelevantEntries,
  formatEntriesAsContext,
  userHasEntries,
} from '@/lib/embeddings'
import { checkRateLimit } from '@/lib/rate-limit'
import { getUserPeerCard, syncMessagesToHoncho } from '@/lib/honcho'

// ─── AI provider detection ────────────────────────────────────────────────────
const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY

const BASE_SYSTEM_PROMPT = `You are a warm, empathetic, and authentic journaling companion. Talk in a relaxed, natural, and conversational tone, like a supportive friend who is deeply present with the user.
Your role is to help the user think clearly, explore their thoughts, and reflect honestly on their experiences:
- Listen actively and respond with genuine warmth and empathy.
- Validate their feelings and experiences naturally without being clinical or robotic.
- Offer thoughtful, gentle perspectives to help them see things from new angles, keeping it collaborative and conversational.
- Ask a single, open-ended, gentle question when appropriate to encourage self-exploration.
- Keep responses concise, warm, and natural — aim for 2-4 sentences in smooth, organic prose without markdown or bullet points.`

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
  let basePrompt = BASE_SYSTEM_PROMPT;
  
  try {
    const peerCard = await getUserPeerCard(userId);
    if (peerCard) {
      basePrompt = `[PEER SNAPSHOT (HONCHO MEMORY)]\nThis is your core psychological model of the user. Use it to maintain deep cross-session continuity, validate emotions, and understand their personality traits:\n${peerCard}\n\n${BASE_SYSTEM_PROMPT}`;
    }
  } catch (err) {
    console.error('[HONCHO] Failed to inject peer card (non-fatal):', err);
  }

  // Only enrich on the first user turn (messages array contains just that one message)
  const isFirstTurn = messages.length === 1

  if (!isFirstTurn) return basePrompt

  try {
    const hasEntries = await userHasEntries(supabase, userId)
    if (!hasEntries) return basePrompt

    const queryEmbedding = await embedText(messages[0].content)
    const entries = await retrieveRelevantEntries(supabase, userId, queryEmbedding, 3)

    if (entries.length === 0) return basePrompt

    const contextBlock = formatEntriesAsContext(entries)
    console.log(`[RAG] Injected ${entries.length} past entr${entries.length === 1 ? 'y' : 'ies'} into system prompt`)

    return `${basePrompt}\n\n${contextBlock}`
  } catch (err) {
    // RAG failure must never break the chat
    console.error('[RAG] Failed to build context (non-fatal):', err)
    return basePrompt
  }
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

    // 1b. Rate limit
    const limited = checkRateLimit(user.id, 'chat')
    if (limited) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: { 'Retry-After': String(limited.retryAfterSeconds) },
        }
      )
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

    if (!hasOpenRouterKey) {
      return NextResponse.json(
        { error: 'No AI provider configured. Set OPENROUTER_API_KEY in environment variables.' },
        { status: 500 }
      )
    }

    // 4. Build system prompt (with RAG context on first turn)
    const systemPrompt = await buildSystemPrompt(supabase, user.id, messages)

    // 5. Stream response from whichever provider is available
    const encoder = new TextEncoder()
    let fullResponseText = ''
    let saved = false

    // Save partial stream if the client disconnects or aborts the request
    request.signal.addEventListener('abort', async () => {
      if (!saved) {
        saved = true
        console.log('[AI] Client connection aborted. Persisting partial response...')
        const partialText = fullResponseText.trim()
          ? `${fullResponseText} ... [interrupted]`
          : '[interrupted]'
        
        const assistantMessage: Message = {
          role: 'assistant',
          content: partialText,
          timestamp: new Date().toISOString(),
        }

        await supabase
          .from('conversations')
          .update({ messages: [...messages, assistantMessage] })
          .eq('id', conversationId)

        syncMessagesToHoncho(user.id, conversationId, [...messages, assistantMessage]).catch((err) =>
          console.error('[HONCHO] Background sync failed during abort:', err)
        );
      }
    })

    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('[AI] Directing request to OpenRouter')
          const openRouterMessages: OpenRouterMessage[] = [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          ]

          fullResponseText = await streamOpenRouter(
            openRouterMessages,
            controller,
            encoder,
            { temperature: 0.7 }
          )

          controller.close()

          if (!saved) {
            saved = true
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

            // Sync full message list to Honcho in the background
            syncMessagesToHoncho(user.id, conversationId, [...messages, assistantMessage]).catch((err) =>
              console.error('[HONCHO] Background sync failed:', err)
            );
          }
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
        'X-AI-Provider': 'openrouter',
      },
    })
  } catch (err) {
    console.error('Chat API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
