import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { embedText, buildEntrySummary } from '@/lib/embeddings'

/**
 * POST /api/admin/backfill-embeddings
 *
 * One-shot route to generate and store embeddings for any journal_entries
 * rows that are missing them. Safe to call multiple times — skips rows
 * that already have an embedding.
 *
 * Only works for the currently authenticated user (no service-role key needed).
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all entries without an embedding for this user
    const { data: entries, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, emotions, patterns, decisions, open_questions, key_context')
      .eq('user_id', user.id)
      .is('embedding', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ message: 'Nothing to backfill — all entries already have embeddings.', processed: 0 })
    }

    const results: { id: string; status: 'ok' | 'skipped' | 'error'; reason?: string }[] = []

    for (const entry of entries) {
      const summary = buildEntrySummary(entry)

      if (!summary.trim()) {
        results.push({ id: entry.id, status: 'skipped', reason: 'empty summary' })
        continue
      }

      try {
        const embedding = await embedText(summary)

        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({ embedding })
          .eq('id', entry.id)

        if (updateError) {
          results.push({ id: entry.id, status: 'error', reason: updateError.message })
        } else {
          results.push({ id: entry.id, status: 'ok' })
        }
      } catch (err) {
        results.push({
          id: entry.id,
          status: 'error',
          reason: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    const failed = results.filter((r) => r.status === 'error').length

    return NextResponse.json({
      message: `Backfill complete. ${ok} embedded, ${failed} failed.`,
      processed: entries.length,
      results,
    })
  } catch (err) {
    console.error('Backfill error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
