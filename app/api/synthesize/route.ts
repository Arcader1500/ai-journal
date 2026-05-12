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

// Vercel Hobby cap is 10s; Pro allows up to 60s.
// We truncate messages below to stay comfortably under 10s.
export const maxDuration = 10

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
    // Truncate to last 30 messages to keep the prompt short and fast
    const recentMessages = messages.slice(-30)
    const conversationText = recentMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    // 6. Call Gemini
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.0-flash-preview',
      systemInstruction: SYNTHESIS_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    })

    const result = await model.generateContent(
      `Here is the journaling conversation to analyze:\n\n${conversationText}`
    )

    const rawText = result.response.text()

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
    const message = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'UnknownError'
    console.error('Synthesize API error:', name, message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
