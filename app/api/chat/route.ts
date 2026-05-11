import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

    if (!conversationId || !Array.isArray(messages)) {
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

    // 4. Prepare messages for Claude (strip our extra timestamp field)
    const claudeMessages = messages.map(({ role, content }) => ({ role, content }))

    // 5. Create streaming response
    const encoder = new TextEncoder()
    let fullResponseText = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
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
              const text = chunk.delta.text
              fullResponseText += text
              controller.enqueue(encoder.encode(text))
            }
          }

          controller.close()

          // 6. Save the full conversation to Supabase after streaming completes
          const assistantMessage: Message = {
            role: 'assistant',
            content: fullResponseText,
            timestamp: new Date().toISOString(),
          }

          const updatedMessages = [...messages, assistantMessage]

          await supabase
            .from('conversations')
            .update({ messages: updatedMessages })
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
      },
    })
  } catch (err) {
    console.error('Chat API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
