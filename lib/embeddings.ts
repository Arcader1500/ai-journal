import { GoogleGenerativeAI } from '@google/generative-ai'
import { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string
  created_at: string
  emotions: { label: string; intensity: number }[]
  patterns: { theme: string; note: string }[]
  open_questions: string[]
  key_context: { entity: string; role: string }[]
  decisions: { action: string; considered: string }[]
}

// ─── Embedding ────────────────────────────────────────────────────────────────

/**
 * Converts a text string into a 768-dim embedding vector using
 * Gemini text-embedding-004.
 */
export async function embedText(text: string): Promise<number[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
  const result = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    taskType: 'SEMANTIC_SIMILARITY' as never,
    // Pin to 1536 dims to match the existing vector(1536) SQL column.
    // gemini-embedding-001 defaults to 3072 without this.
    outputDimensionality: 1536,
  } as never)
  return result.embedding.values
}

/**
 * Builds a compact summary string from a structured journal entry —
 * this is what gets embedded and stored at synthesis time.
 */
export function buildEntrySummary(entry: Omit<JournalEntry, 'id' | 'created_at'>): string {
  const parts: string[] = []

  if (entry.emotions?.length) {
    parts.push(
      'Emotions: ' + entry.emotions.map((e) => `${e.label}(${e.intensity.toFixed(1)})`).join(', ')
    )
  }
  if (entry.patterns?.length) {
    parts.push('Patterns: ' + entry.patterns.map((p) => p.theme).join(', '))
  }
  if (entry.decisions?.length) {
    parts.push('Decisions: ' + entry.decisions.map((d) => d.action).join(', '))
  }
  if (entry.open_questions?.length) {
    parts.push('Open questions: ' + entry.open_questions.join(' / '))
  }
  if (entry.key_context?.length) {
    parts.push(
      'Key context: ' + entry.key_context.map((k) => `${k.entity}(${k.role})`).join(', ')
    )
  }

  return parts.join('. ')
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Finds the top-N journal entries most similar to the given embedding
 * using pgvector cosine distance.
 *
 * Requires the `match_journal_entries` RPC function in Supabase:
 *
 *   create or replace function match_journal_entries(
 *     p_user_id   uuid,
 *     p_embedding vector(1536),
 *     p_limit     int default 3
 *   ) returns setof journal_entries
 *   language sql stable as $$
 *     select * from journal_entries
 *     where user_id = p_user_id
 *       and embedding is not null
 *     order by embedding <=> p_embedding
 *     limit p_limit;
 *   $$;
 */
export async function retrieveRelevantEntries(
  supabase: SupabaseClient,
  userId: string,
  queryEmbedding: number[],
  limit = 3
): Promise<JournalEntry[]> {
  const { data, error } = await supabase.rpc('match_journal_entries', {
    p_user_id: userId,
    p_embedding: queryEmbedding,
    p_limit: limit,
  })

  if (error) {
    console.error('[RAG] retrieveRelevantEntries error:', error.message)
    return []
  }

  return (data ?? []) as JournalEntry[]
}

/**
 * Checks if a user has at least one synthesized entry with an embedding.
 * Used to decide whether to run RAG at all.
 */
export async function userHasEntries(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('embedding', 'is', null)

  return (count ?? 0) > 0
}

// ─── Context Formatting ───────────────────────────────────────────────────────

/**
 * Renders retrieved journal entries as a plain-text context block
 * that is prepended to the system prompt — invisible to the user.
 */
export function formatEntriesAsContext(entries: JournalEntry[]): string {
  if (entries.length === 0) return ''

  const lines = entries.map((e, i) => {
    const date = new Date(e.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    const parts: string[] = [`Entry ${i + 1} (${date}):`]

    if (e.emotions?.length) {
      parts.push(
        '  Emotions: ' + e.emotions.map((em) => `${em.label} (${em.intensity.toFixed(1)})`).join(', ')
      )
    }
    if (e.patterns?.length) {
      parts.push('  Patterns: ' + e.patterns.map((p) => `${p.theme} — ${p.note}`).join('; '))
    }
    if (e.open_questions?.length) {
      parts.push('  Open questions: ' + e.open_questions.join(' / '))
    }
    if (e.key_context?.length) {
      parts.push(
        '  Key context: ' + e.key_context.map((k) => `${k.entity} (${k.role})`).join(', ')
      )
    }

    return parts.join('\n')
  })

  return (
    '[BACKGROUND CONTEXT — not visible to user]\n' +
    'Relevant past journal entries retrieved from your history:\n\n' +
    lines.join('\n\n') +
    '\n[END BACKGROUND CONTEXT]'
  )
}
