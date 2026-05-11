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

export default async function ChatPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth')
  }

  // ── Load all conversations for this user ──────────────────────────────────
  const { data: allConversations } = await supabase
    .from('conversations')
    .select('id, started_at, synthesized, messages')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })

  const conversations = allConversations ?? []

  // ── Find today's active (unsynthesized) conversation ─────────────────────
  const todayISO = todayStart()
  let activeConversation = conversations.find(
    (c) => !c.synthesized && c.started_at >= todayISO
  ) ?? null

  // ── Auto-create if none exists for today ─────────────────────────────────
  if (!activeConversation) {
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        messages: [],
        synthesized: false,
      })
      .select()
      .single()

    if (!error && newConv) {
      activeConversation = newConv
      // Prepend to list so the sidebar shows it
      conversations.unshift(newConv)
    }
  }

  // ── Past (synthesized) conversations for the sidebar ─────────────────────
  const pastConversations = conversations.filter((c) => c.synthesized)

  return (
    <ChatInterface
      conversationId={activeConversation?.id ?? ''}
      initialMessages={activeConversation?.messages ?? []}
      userEmail={user.email ?? ''}
      pastConversations={pastConversations}
    />
  )
}
