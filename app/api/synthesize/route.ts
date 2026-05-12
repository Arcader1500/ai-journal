import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Synthesis prompt ────────────────────────────────────────────────────────
const SYNTHESIS_PROMPT = `You are analyzing a journaling conversation. Extract the following and return ONLY valid JSON, no markdown, no preamble, no trailing text:

{
  "emotions": [{ "label": string, "intensity": number }],
  "decisions": [{ "action": string, "considered": string }],
  "patterns": [{ "theme": string, "note": string }],
  "open_questions": [string],
  "key_context": [{ "entity": string, "role": string }]
}

Rules:
- intensity is a float between 0 and 1
- Be precise. Do not invent. Only extract what is explicitly present.
- If a field has nothing to extract, use an empty array [].`

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

interface SynthesisResult {
  emotions: { label: string; intensity: number }[]
  decisions: { action: string; considered: string }[]
  patterns: { theme: string; note: string }[]
  open_questions: string[]
  key_context: { entity: string; role: string }[]
}

// Vercel: give synthesis up to 30s (requires Vercel Pro for > 10s on Hobby)
export const maxDuration = 30

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

    // 2. Parse body
    const body = await request.json()
    const { conversationId } = body as { conversationId: string }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    // 3. Fetch conversation — verify ownership
    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('id, user_id, messages, synthesized')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 4. Idempotency guard
    if (conversation.synthesized) {
      return NextResponse.json(
        { error: 'Conversation has already been synthesized' },
        { status: 409 }
      )
    }

    const messages: Message[] = conversation.messages ?? []

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Cannot synthesize an empty conversation' },
        { status: 400 }
      )
    }

    // 5. Format conversation text for Claude
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    // 6. Call Claude
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: SYNTHESIS_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Here is the journaling conversation to analyze:\n\n${conversationText}`,
        },
      ],
    })

    const rawText =
      claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''

    // 7. Parse JSON — strip any accidental markdown fences
    let synthesis: SynthesisResult
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      synthesis = JSON.parse(cleaned)
    } catch {
      console.error('Synthesis JSON parse failed. Raw output:', rawText)
      return NextResponse.json(
        { error: 'AI returned invalid JSON. Try again.' },
        { status: 502 }
      )
    }

    // 8. Save journal entry
    const { data: entry, error: insertError } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        emotions: synthesis.emotions ?? [],
        decisions: synthesis.decisions ?? [],
        patterns: synthesis.patterns ?? [],
        open_questions: synthesis.open_questions ?? [],
        key_context: synthesis.key_context ?? [],
      })
      .select('id')
      .single()

    if (insertError || !entry) {
      console.error('Insert journal entry error:', insertError)
      return NextResponse.json({ error: 'Failed to save journal entry' }, { status: 500 })
    }

    // 9. Mark conversation as synthesized
    await supabase
      .from('conversations')
      .update({ synthesized: true })
      .eq('id', conversationId)

    return NextResponse.json({ success: true, entryId: entry.id })
  } catch (err) {
    console.error('Synthesize API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
