export const runtime = 'edge'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildEntrySummary, embedText } from '@/lib/embeddings'
import { callOpenRouter } from '@/lib/openrouter'

async function callGemini(prompt: string): Promise<string> {
  return callOpenRouter(
    [{ role: 'user', content: prompt }],
    { responseMimeType: 'application/json', temperature: 0.7 }
  )
}

export async function POST(request: Request) {
  try {
    const { jobId, conversationId } = await request.json()

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )

    // Get user from cookies
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('Unauthorized')
    }

    // Update job status to processing
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('user_id', user.id)

    if (updateError) {
      throw new Error('Failed to update job status')
    }

    // Fetch conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      throw new Error('Conversation not found or unauthorized')
    }

    // Build prompt from messages
    const messages = conversation.messages || []
    if (!messages.length) {
      throw new Error('No messages in conversation')
    }

    const prompt = `You are a reflective journal synthesis AI. Analyze the following conversation between a user and their journaling companion.
Extract the key emotional tags, decisions, patterns, questions, and entity contexts. Respond ONLY with a valid JSON object matching exactly this schema, with no preamble, no markdown code blocks:

{
  "emotions": [{ "label": string, "intensity": float 0-1 }],
  "decisions": [{ "action": string, "considered": string }],
  "patterns": [{ "theme": string, "note": string }],
  "open_questions": [string],
  "key_context": [{ "entity": string, "role": string }]
}

Be precise. Do not invent details. Only extract what is explicitly present in the conversation.

Conversation to analyze:
${messages.map((msg: any) => `${msg.role === 'assistant' ? 'AI' : 'User'}: ${msg.content}`).join('\n')}`

    // Call Gemini
    const journalEntry = await callGemini(prompt)

    // Strip markdown fences if Gemini wraps with them despite responseMimeType
    const cleaned = journalEntry
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    // Parse entry structure
    const entryData = JSON.parse(cleaned)

    // Insert journal entry
    const { data: insertedEntry, error: insertError } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        emotions: entryData.emotions || [],
        decisions: entryData.decisions || [],
        patterns: entryData.patterns || [],
        open_questions: entryData.open_questions || [],
        key_context: entryData.key_context || [],
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !insertedEntry) {
      throw new Error(`Failed to insert entry: ${insertError?.message}`)
    }

    // Generate embedding (best-effort, don't fail if this fails)
    try {
      const summary = buildEntrySummary(entryData)
      const embedding = await embedText(summary)
      await supabase
        .from('journal_entries')
        .update({ embedding })
        .eq('id', insertedEntry.id)
    } catch (embedError) {
      console.warn('Failed to generate embedding:', embedError)
      // Continue even if embedding fails
    }

    // Update job status to completed
    const { error: finalUpdateError } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        result: entryData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('user_id', user.id)

    if (finalUpdateError) {
      throw new Error('Failed to update job status to completed')
    }

    return new Response('Job completed', { status: 202 })
  } catch (error) {
    console.error('Error in Edge Function:', error)

    // Update job status to failed
    const { jobId } = await request.json().catch(() => ({ jobId: 'unknown' }))

    try {
      const cookieStore = await cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll()
            },
          },
        }
      )

      const { data: { user } } = await supabase.auth.getUser()
      if (user && jobId !== 'unknown') {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('user_id', user.id)
      }
    } catch (updateError) {
      console.error('Failed to update job status to failed:', updateError)
    }

    return new Response(
      `Job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    )
  }
}
