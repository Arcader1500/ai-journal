export const runtime = 'edge'

import { createRouteHandlerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = 'gemini-3-flash-preview'

async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
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
    const { jobId, conversationId } = await request.json()

    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore.getAll(),
    })

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

    const prompt = messages.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n')

    // Call Gemini
    const journalEntry = await callGemini(prompt)

    // Parse entry structure (expected format: topic, summary, keywords)
    const entryData = JSON.parse(journalEntry)

    // Validate entry structure
    if (!entryData.topic || !entryData.summary) {
      throw new Error('Invalid entry format from Gemini')
    }

    // Insert journal entry
    const { error: insertError } = await supabase
      .from('entries')
      .insert({
        user_id: user.id,
        conversation_id: conversationId,
        topic: entryData.topic,
        summary: entryData.summary,
        keywords: entryData.keywords || [],
        created_at: new Date().toISOString(),
      })

    if (insertError) {
      throw new Error(`Failed to insert entry: ${insertError.message}`)
    }

    // Generate embedding (best-effort, don't fail if this fails)
    try {
      const { embedText } = await import('@/lib/embeddings')
      const embedding = await embedText(entryData.summary)
      await supabase
        .from('entries')
        .update({ embedding })
        .eq('conversation_id', conversationId)
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
    const { jobId, conversationId } = await request.json().catch(() => ({ jobId: 'unknown', conversationId: 'unknown' }))

    try {
      const cookieStore = await cookies()
      const supabase = createRouteHandlerClient({
        cookies: () => cookieStore.getAll(),
      })

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
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
