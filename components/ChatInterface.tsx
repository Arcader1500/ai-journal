'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ConversationSidebar from './ConversationSidebar'

import { type Message, type JournalEntry, type Conversation } from '@/lib/types'

// Re-export Message so consumers of ChatInterface don't need a separate import
export type { Message }

interface ChatInterfaceProps {
  conversationId: string | null
  initialMessages: Message[]
  userEmail: string
  allConversations: Conversation[]
  journalEntries: JournalEntry[]
  isSynthesized: boolean
  /** Entry ID if this conversation is already synthesized (from server) */
  journalEntryId?: string | null
}

export default function ChatInterface({
  conversationId: initialConversationId,
  initialMessages,
  userEmail,
  allConversations,
  journalEntries,
  isSynthesized,
  journalEntryId: initialJournalEntryId = null,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isSynthesizing, setIsSynthesizing] = useState(false)
  const [synthesizeError, setSynthesizeError] = useState<string | null>(null)
  const [synthesizeDone, setSynthesizeDone] = useState(false)
  const [localConversations, setLocalConversations] = useState(allConversations)
  const [localEntries, setLocalEntries] = useState(journalEntries)
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  // entryId of the synthesized journal entry (from API or initial server prop)
  const [synthesizedEntryId, setSynthesizedEntryId] = useState<string | null>(initialJournalEntryId)
  // conversationId is null until the user sends their first message
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const [proactiveGreeting, setProactiveGreeting] = useState<string | null>(null)
  const [greetingLoading, setGreetingLoading] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supabase = useMemo(() => createClient(), [])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (messages.length === 0) {
      setGreetingLoading(true);
      fetch('/api/chat/proactive-greeting')
        .then((res) => res.json())
        .then((data) => {
          if (data.greeting) {
            setProactiveGreeting(data.greeting);
          }
        })
        .catch((err) => console.error('Failed to load proactive greeting:', err))
        .finally(() => setGreetingLoading(false));
    } else {
      setProactiveGreeting(null);
    }
  }, [messages.length, conversationId]);

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

  async function handleNewConversation() {
    try {
      const res = await fetch('/api/conversations/new', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.id) {
        router.push(`/chat?conv=${data.id}`)
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to create new conversation:', err)
    }
  }

  async function handleSynthesize() {
    if (isSynthesizing || synthesizeDone || isSynthesized || !conversationId) return
    setSynthesizeError(null)
    setIsSynthesizing(true)
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSynthesizeError(data.error ?? 'Synthesis failed. Try again.')
        setIsSynthesizing(false)
        return
      }

      // Synthesis is synchronous now — done immediately
      setSynthesizeDone(true)
      setSynthesizedEntryId(data.entryId ?? null)
      setIsSynthesizing(false)
      router.refresh()
    } catch {
      setSynthesizeError('Network error. Try again.')
      setIsSynthesizing(false)
    }
  }

  // Cleanup polling ref on unmount (kept for safety, polling removed)
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setIsLoading(true)

    try {
      // Lazily create a conversation on the very first message
      let activeConvId = conversationId
      if (!activeConvId) {
        const convRes = await fetch('/api/conversations/new', { method: 'POST' })
        if (!convRes.ok) throw new Error('Failed to create conversation')
        const convData = await convRes.json()
        activeConvId = convData.id as string
        setConversationId(activeConvId)
        // Add to sidebar list immediately
        setLocalConversations((prev) => [
          { id: activeConvId!, started_at: new Date().toISOString(), messages: [], synthesized: false },
          ...prev,
        ])
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConvId, messages: nextMessages }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response body')

      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])

      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...assistantMessage, content: fullText }
          return updated
        })
      }
    } catch (err) {
      console.error('Chat error:', err)
      setMessages(messages)
      setInput(text)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <ConversationSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        allConversations={localConversations}
        activeConversationId={conversationId ?? ''}
        onNewConversation={handleNewConversation}
        onConversationDeleted={(id) => {
          setLocalConversations((prev) => prev.filter((c) => c.id !== id))
          // If the active conversation was deleted, create a fresh one
          if (id === conversationId) {
            handleNewConversation()
          }
        }}
      />

      <div className="chat-layout">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-brand">
            {/* Sidebar toggle */}
            <button
              id="sidebar-toggle-btn"
              className="icon-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open past sessions"
              title="Past sessions"
            >
              ☰
            </button>
            <div className="chat-header-icon" aria-hidden>✦</div>
            <div>
              <div className="chat-header-title">AI Journal</div>
              <div className="chat-header-subtitle">Your reflective companion</div>
            </div>
          </div>
          <div className="chat-header-actions">
            {/* Synthesize button — shown when conversation has messages and is not yet synthesized */}
            {messages.length > 0 && !isSynthesized && !synthesizeDone && (
              <button
                id="synthesize-btn"
                className={`synth-btn ${isSynthesizing ? 'synth-btn-loading' : ''}`}
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                title="Synthesize this conversation into a journal entry"
                aria-label="Synthesize conversation"
              >
                {isSynthesizing ? (
                  <><span className="spinner" aria-hidden /> Synthesizing… {jobStatus && ` (${jobStatus})`}</>
                ) : (
                  '✦ Synthesize'
                )}
              </button>
            )}
            {(synthesizeDone || isSynthesized) && synthesizedEntryId && (
              <a
                id="view-entry-btn"
                href={`/journal/${synthesizedEntryId}`}
                className="view-entry-btn"
                aria-label="View journal entry"
              >
                ✦ View Entry →
              </a>
            )}
            {(synthesizeDone || isSynthesized) && !synthesizedEntryId && (
              <span className="synth-done-badge" aria-label="Entry saved">✓ Saved</span>
            )}
            {synthesizeError && (
              <span className="synth-error" role="alert" title={synthesizeError}>⚠</span>
            )}
            <Link
              href="/insights"
              id="insights-btn"
              className="icon-btn"
              title="View Insights Dashboard"
              style={{ fontSize: '1.25rem', marginRight: '8px', color: 'var(--text-secondary)', transition: 'color 0.2s ease', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              aria-label="View Insights Dashboard"
            >
              📊
            </Link>
            <button
              id="sign-out-btn"
              className="icon-btn"
              onClick={handleSignOut}
              title={`Sign out (${userEmail})`}
              aria-label="Sign out"
            >
              ↗
            </button>
          </div>
        </header>

        {/* Messages */}
        <main
          className="chat-messages"
          id="chat-messages"
          aria-live="polite"
          aria-label="Conversation"
        >
          {messages.length === 0 ? (
            <div className="chat-empty" aria-label="Empty state">
              <div className="chat-empty-icon">✦</div>
              <h2 className="chat-empty-title">
                {greetingLoading ? 'Recalling context...' : 'Ready when you are'}
              </h2>
              <p className="chat-empty-body" style={{ fontStyle: proactiveGreeting ? 'italic' : 'normal', color: proactiveGreeting ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {greetingLoading ? (
                  'Syncing with your cognitive model...'
                ) : proactiveGreeting ? (
                  proactiveGreeting
                ) : (
                  "Tell me what's on your mind — a decision you're weighing, something that happened, or how you're feeling. I'll help you think it through honestly."
                )}
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}
              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="message-wrapper assistant" aria-label="AI is typing">
                  <div className="message-avatar assistant" aria-hidden>✦</div>
                  <div className="message-bubble assistant">
                    <div className="typing-indicator">
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                      <div className="typing-dot" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </main>

        {/* Input */}
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          isLoading={isLoading}
        />
      </div>
    </>
  )
}
