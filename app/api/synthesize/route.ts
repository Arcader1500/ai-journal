export const runtime = 'edge'
export const maxDuration = 60

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-3-flash-preview'

async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export async function POST(request: Request) {
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

    const { conversationId } = await request.json()

    // Authenticate
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }

    // Verify conversation ownership
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found or unauthorized' }, { status: 404 })
    }

    // Guard: already synthesized?
    const { data: existingEntry } = await supabase
      .from('entries')
      .select('id')
      .eq('conversation_id', conversationId)
      .single()

    if (existingEntry) {
      return NextResponse.json({ error: 'Conversation already synthesized' }, { status: 409 })
    }

    // Build prompt from messages
    const messages = conversation.messages || []
    if (!messages.length) {
      return NextResponse.json({ error: 'No messages to synthesize' }, { status: 400 })
    }

    const SYNTHESIS_PROMPT = `You are a reflective journal synthesis AI. Analyze the following conversation between a user and their journaling companion. Extract the key themes and produce a JSON object with exactly these fields:
- "topic": a concise title for this journal entry (max 10 words)
- "summary": a thoughtful 2-4 paragraph synthesis of what the user explored, what they realized, and any patterns or open questions that emerged
- "keywords": an array of 3-6 keyword strings capturing the main themes

Conversation to analyze:
${messages.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`).join('\n')}

Respond ONLY with valid JSON matching the schema described above.`

    const rawResponse = await callGemini(SYNTHESIS_PROMPT)

    // Parse — strip markdown fences if present
    const cleaned = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const entryData = JSON.parse(cleaned)

    if (!entryData.topic || !entryData.summary) {
      throw new Error('Invalid entry format from Gemini')
    }

    // Insert journal entry
    const { data: insertedEntry, error: insertError } = await supabase
      .from('entries')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        topic: entryData.topic,
        summary: entryData.summary,
        keywords: entryData.keywords || [],
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !insertedEntry) {
      throw new Error(`Failed to insert entry: ${insertError?.message}`)
    }

    // Mark conversation synthesized
    await supabase
      .from('conversations')
      .update({ synthesized: true })
      .eq('id', conversationId)

    // Generate embedding (best-effort)
    try {
      const embeddingRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: entryData.summary }] },
          }),
        }
      )
      if (embeddingRes.ok) {
        const embeddingData = await embeddingRes.json()
        const embedding = embeddingData.embedding?.values
        if (embedding) {
          await supabase
            .from('entries')
            .update({ embedding })
            .eq('id', insertedEntry.id)
        }
      }
    } catch (embedError) {
      console.warn('Failed to generate embedding (non-fatal):', embedError)
    }

    return NextResponse.json({
      status: 'completed',
      entryId: insertedEntry.id,
      topic: entryData.topic,
    })
  } catch (error) {
    console.error('Error in /api/synthesize:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
