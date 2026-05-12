import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatInterface from '@/components/ChatInterface'

export const metadata = {
  title: 'Chat — AI Journal',
  description: 'Have an honest, reflective conversation with your AI journaling companion.',
}

/** Returns the start of today in UTC as an ISO string — used to gate daily auto-create */
function todayStart(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // ── Resolve conv param ────────────────────────────────────────────────────
  const { conv: convParam } = await searchParams

  // ── Load all conversations for this user ──────────────────────────────────
  const { data: allConversations } = await supabase
    .from('conversations')
    .select('id, started_at, synthesized, messages')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })

  const conversations = allConversations ?? []

  // ── Resolve active conversation ──────────────────────────────────────────
  let activeConversation =
    // 1. Specific conv requested via ?conv=
    (convParam
      ? conversations.find((c) => c.id === convParam)
      : null) ??
    // 2. Today's unsynthesized conversation
    conversations.find((c) => !c.synthesized && c.started_at >= todayStart()) ??
    null

  // ── Auto-create if none exists ────────────────────────────────────────────
  if (!activeConversation) {
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({ user_id: user.id, messages: [], synthesized: false })
      .select()
      .single()

    if (!error && newConv) {
      activeConversation = newConv
      conversations.unshift(newConv)
    }
  }

  // ── Journal entries for sidebar + entry map for session links ─────────────
  const { data: rawEntries } = await supabase
    .from('journal_entries')
    .select('id, created_at, conversation_id, emotions, decisions, patterns, open_questions, key_context')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const journalEntries = rawEntries ?? []

  const entryMap = new Map<string, string>(
    journalEntries.map((e) => [e.conversation_id, e.id])
  )

  // Pass ALL conversations — sidebar will split them into in-progress vs. past
  const allConvs = conversations.map((c) => ({
    ...c,
    journal_entry_id: entryMap.get(c.id),
  }))

  return (
    <ChatInterface
      conversationId={activeConversation?.id ?? ''}
      initialMessages={activeConversation?.messages ?? []}
      userEmail={user.email ?? ''}
      allConversations={allConvs}
      journalEntries={journalEntries}
      isSynthesized={activeConversation?.synthesized ?? false}
    />
  )
}
