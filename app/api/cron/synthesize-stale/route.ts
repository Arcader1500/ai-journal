import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { synthesizeConversation } from '@/lib/synthesis'

export const maxDuration = 60 // Allow up to 60s for batch processing in serverless functions

export async function GET(request: Request) {
  try {
    // 1. Authorization validation using the Bearer token pattern
    const authHeader = request.headers.get('Authorization')
    const expectedHeader = `Bearer ${process.env.CRON_SECRET}`

    if (!process.env.CRON_SECRET) {
      console.error('[Cron] CRON_SECRET is not configured in environment variables.')
      return NextResponse.json({ error: 'Cron misconfigured' }, { status: 500 })
    }

    if (!authHeader || authHeader !== expectedHeader) {
      console.warn('[Cron] Unauthorized attempt to trigger auto-synthesis')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Initialize Supabase Service Role Client to bypass RLS and operate across all users
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Cron] Missing Supabase environment variables for service client.')
      return NextResponse.json({ error: 'Database credentials misconfigured' }, { status: 500 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    // 3. Find conversations older than 3 days that are not synthesized
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 3)

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, user_id, messages, synthesized, started_at')
      .or('synthesized.eq.false,synthesized.is.null')
      .lt('started_at', cutoffDate.toISOString())

    if (error) {
      console.error('[Cron] Failed to fetch stale conversations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({
        message: 'No stale conversations found to synthesize.',
        processed: 0,
        failed: 0,
        skipped: 0,
      })
    }

    console.log(`[Cron] Found ${conversations.length} candidate stale conversations.`)

    const results = {
      processed: 0,
      failed: 0,
      skipped: 0,
      details: [] as { conversationId: string; status: 'synthesized' | 'skipped' | 'failed'; error?: string }[],
    }

    // 4. Batch synthesize each eligible conversation
    for (const conversation of conversations) {
      const messages = conversation.messages || []

      // Skip conversations with no messages or just empty arrays (e.g. freshly created but never used)
      if (!Array.isArray(messages) || messages.length === 0) {
        results.skipped++
        results.details.push({
          conversationId: conversation.id,
          status: 'skipped',
          error: 'No messages to synthesize',
        })
        continue
      }

      try {
        await synthesizeConversation(supabase, {
          id: conversation.id,
          user_id: conversation.user_id,
          messages: messages as { role: string; content: string }[],
        })
        results.processed++
        results.details.push({
          conversationId: conversation.id,
          status: 'synthesized',
        })
      } catch (err) {
        results.failed++
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[Cron] Failed to synthesize conversation ${conversation.id}:`, errMsg)
        results.details.push({
          conversationId: conversation.id,
          status: 'failed',
          error: errMsg,
        })
      }
    }

    console.log(`[Cron] Complete: ${results.processed} synthesized, ${results.failed} failed, ${results.skipped} skipped.`)

    return NextResponse.json({
      message: 'Cron execution completed.',
      ...results,
    })
  } catch (err) {
    console.error('[Cron] Unexpected error during execution:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
