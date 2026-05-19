/**
 * lib/synthesis.ts
 *
 * Shared synthesis logic used by both:
 *  - POST /api/synthesize       (user-triggered, single conversation)
 *  - GET  /api/cron/synthesize-stale  (cron-triggered, batch)
 */

import { SupabaseClient } from '@supabase/supabase-js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-3-flash-preview'

interface ConversationMessage {
  role: string
  content: string
}

interface SynthesisResult {
  entryId: string
  topic: string
}

const SYNTHESIS_PROMPT_TEMPLATE = (messages: ConversationMessage[]) => `You are a reflective journal synthesis AI. Analyze the following conversation between a user and their journaling companion. Extract the key themes and produce a JSON object with exactly these fields:
- "topic": a concise title for this journal entry (max 10 words)
- "summary": a thoughtful 2-4 paragraph synthesis of what the user explored, what they realized, and any patterns or open questions that emerged
- "keywords": an array of 3-6 keyword strings capturing the main themes

Conversation to analyze:
${messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n')}

Respond ONLY with valid JSON matching the schema described above.`

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

/**
 * Synthesizes a single conversation into a journal entry.
 *
 * Performs the full pipeline:
 *   1. Calls Gemini to extract topic, summary, keywords
 *   2. Inserts a row into `entries`
 *   3. Marks `conversations.synthesized = true`
 *   4. Generates and stores an embedding (best-effort, non-fatal)
 *
 * @throws if the conversation has no messages, Gemini fails, or DB insert fails
 */
export async function synthesizeConversation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  conversation: {
    id: string
    user_id: string
    messages: ConversationMessage[]
  }
): Promise<SynthesisResult> {
  const { id: conversationId, user_id: userId, messages } = conversation

  if (!messages || messages.length === 0) {
    throw new Error('No messages to synthesize')
  }

  // ── 1. Call Gemini ────────────────────────────────────────────────────────
  const rawResponse = await callGemini(SYNTHESIS_PROMPT_TEMPLATE(messages))

  // Strip markdown fences if Gemini wraps with them despite responseMimeType
  const cleaned = rawResponse
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()

  const entryData = JSON.parse(cleaned)

  if (!entryData.topic || !entryData.summary) {
    throw new Error('Invalid entry format from Gemini')
  }

  // ── 2. Insert journal entry ───────────────────────────────────────────────
  const { data: insertedEntry, error: insertError } = await supabase
    .from('entries')
    .insert({
      user_id: userId,
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

  // ── 3. Mark conversation synthesized ─────────────────────────────────────
  await supabase
    .from('conversations')
    .update({ synthesized: true })
    .eq('id', conversationId)

  // ── 4. Generate embedding (best-effort) ───────────────────────────────────
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
    console.warn('[synthesis] Failed to generate embedding (non-fatal):', embedError)
  }

  return { entryId: insertedEntry.id, topic: entryData.topic }
}
