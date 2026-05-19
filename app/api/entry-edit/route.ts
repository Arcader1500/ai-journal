import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedText, buildEntrySummary } from '@/lib/embeddings'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface EntryPatch {
  emotions?: { label: string; intensity: number }[]
  decisions?: { action: string; considered: string }[]
  patterns?: { theme: string; note: string }[]
  open_questions?: string[]
  key_context?: { entity: string; role: string }[]
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { entryId, messages } = body as { entryId: string; messages: Message[] }

    if (!entryId || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Fetch entry and verify ownership
    const { data: entry, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, emotions, decisions, patterns, open_questions, key_context')
      .eq('id', entryId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    const entryJson = JSON.stringify(
      {
        emotions: entry.emotions,
        decisions: entry.decisions,
        patterns: entry.patterns,
        open_questions: entry.open_questions,
        key_context: entry.key_context,
      },
      null,
      2
    )

    const systemPrompt = `You are a precise journal entry editor. The user wants to add missing details, correct inaccuracies, or remove information from their structured journal entry.

Rules:
- Be brief and conversational (2-3 sentences max).
- If the user requests a change, apply it and append a PATCH block at the very end of your response using this EXACT format:
<PATCH>{"field": updated_value}</PATCH>
- Only include fields that changed. Available fields: emotions, decisions, patterns, open_questions, key_context.
- Use the same data structures as below.
- If no changes are needed, do NOT include a PATCH block.

Current journal entry:
${entryJson}`

    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      systemInstruction: systemPrompt,
    })
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const chat = model.startChat({ history })
    const result = await chat.sendMessage(messages[messages.length - 1].content)
    const rawResponse = result.response.text()

    // Extract and strip PATCH block
    let message = rawResponse
    let entryUpdated = false

    const patchMatch = rawResponse.match(/<PATCH>([\s\S]*?)<\/PATCH>/)
    if (patchMatch) {
      message = rawResponse.replace(/<PATCH>[\s\S]*?<\/PATCH>/, '').trim()
      try {
        const patch: EntryPatch = JSON.parse(patchMatch[1].trim())
        const updateData: Record<string, unknown> = {}

        if (patch.emotions !== undefined) updateData.emotions = patch.emotions
        if (patch.decisions !== undefined) updateData.decisions = patch.decisions
        if (patch.patterns !== undefined) updateData.patterns = patch.patterns
        if (patch.open_questions !== undefined) updateData.open_questions = patch.open_questions
        if (patch.key_context !== undefined) updateData.key_context = patch.key_context

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('journal_entries')
            .update(updateData)
            .eq('id', entryId)

          if (!updateError) {
            entryUpdated = true

            // Re-embed with merged data so the RAG index stays current (best-effort)
            try {
              const merged = {
                emotions: (updateData.emotions as typeof entry.emotions) ?? entry.emotions,
                decisions: (updateData.decisions as typeof entry.decisions) ?? entry.decisions,
                patterns: (updateData.patterns as typeof entry.patterns) ?? entry.patterns,
                open_questions: (updateData.open_questions as typeof entry.open_questions) ?? entry.open_questions,
                key_context: (updateData.key_context as typeof entry.key_context) ?? entry.key_context,
              }
              const summary = buildEntrySummary(merged)
              const embedding = await embedText(summary)
              await supabase
                .from('journal_entries')
                .update({ embedding })
                .eq('id', entryId)
            } catch (embedErr) {
              console.warn('[entry-edit] Re-embedding failed (non-fatal):', embedErr)
            }
          } else {
            console.error('Supabase patch error:', updateError)
          }
        }
      } catch {
        console.error('Failed to parse PATCH block from AI response')
      }
    }

    return NextResponse.json({ message, entryUpdated })
  } catch (err) {
    console.error('Entry edit API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
