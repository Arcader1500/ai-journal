'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ConversationSidebar from './ConversationSidebar'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface PastConversation {
  id: string
  started_at: string
  messages: { role: string; content: string }[]
  synthesized: boolean
}

interface ChatInterfaceProps {
  conversationId: string
  initialMessages: Message[]
  userEmail: string
  pastConversations: PastConversation[]
}

export default function ChatInterface({
  conversationId,
  initialMessages,
  userEmail,
  pastConversations,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth')
    router.refresh()
  }

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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, messages: nextMessages }),
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
        pastConversations={pastConversations}
        activeConversationId={conversationId}
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
              <h2 className="chat-empty-title">Ready when you are</h2>
              <p className="chat-empty-body">
                Tell me what&apos;s on your mind — a decision you&apos;re weighing, something that happened, or how you&apos;re feeling. I&apos;ll help you think it through honestly.
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
