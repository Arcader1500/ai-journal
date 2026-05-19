import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import JournalEntryCard from '@/components/JournalEntryCard'
import { type JournalEntry } from '@/lib/types'

export const metadata = {
  title: 'Journal Entry — AI Journal',
  description: 'View a structured journal entry synthesized from your conversation.',
}

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select('id, created_at, conversation_id, emotions, decisions, patterns, open_questions, key_context')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !entry) {
    notFound()
  }

  return (
    <div className="journal-page">
      <header className="journal-page-header">
        <Link href="/chat" className="journal-back-btn" aria-label="Back to chat">
          ← Back
        </Link>
        <div className="journal-page-title-group">
          <div className="chat-header-icon" aria-hidden>✦</div>
          <h1 className="journal-page-title">Journal Entry</h1>
        </div>
      </header>

      <main className="journal-page-body">
        <JournalEntryCard entry={entry as JournalEntry} />
      </main>
    </div>
  )
}
