export const runtime = 'edge'
export const maxDuration = 60

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { synthesizeConversation } from '@/lib/synthesis'

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
      .from('journal_entries')
      .select('id')
      .eq('conversation_id', conversationId)
      .single()

    if (existingEntry) {
      return NextResponse.json({ error: 'Conversation already synthesized' }, { status: 409 })
    }

    // Synthesize using shared helper
    const result = await synthesizeConversation(supabase, conversation)

    return NextResponse.json({
      status: 'completed',
      entryId: result.entryId,
      topic: result.topic,
    })
  } catch (error) {
    console.error('Error in /api/synthesize:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

