import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import JournalEntryCard from '@/components/JournalEntryCard'
import { type JournalEntry } from '@/lib/types'

export const metadata = {
  title: 'Journal Entries — AI Journal',
  description: 'Browse all your synthesized journal entries.',
}

export default async function JournalPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const { data: rawEntries } = await supabase
    .from('journal_entries')
    .select('id, created_at, conversation_id, emotions, decisions, patterns, open_questions, key_context')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const entries = (rawEntries ?? []) as JournalEntry[]

  return (
    <div className="journal-page">
      {/* Header */}
      <header className="journal-page-header">
        <Link href="/chat" className="journal-back-btn" aria-label="Back to chat">
          ← Back
        </Link>
        <div className="journal-page-title-group">
          <div className="chat-header-icon" aria-hidden>✦</div>
          <h1 className="journal-page-title">Journal Entries</h1>
        </div>
      </header>

      {/* Entry list */}
      <main className="journal-page-body">
        {entries.length === 0 ? (
          <div className="journal-empty">
            <div className="journal-empty-icon">✦</div>
            <h2 className="journal-empty-title">No entries yet</h2>
            <p className="journal-empty-body">
              Synthesize a conversation to create your first journal entry.
            </p>
            <Link href="/chat" className="journal-empty-cta">
              Start a conversation →
            </Link>
          </div>
        ) : (
          <div className="journal-entry-list">
            {entries.map((entry) => (
              <JournalEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
