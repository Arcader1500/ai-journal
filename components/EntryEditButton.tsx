'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { type JournalEntry, type Message } from '@/lib/types'


interface Props {
  entry: JournalEntry
}

export default function EntryEditButton({ entry }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when drawer opens; reset state
  useEffect(() => {
    if (open) {
      setMessages([])
      setInput('')
      setSavedCount(0)
      setTimeout(() => textareaRef.current?.focus(), 320)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: Message = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/entry-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry.id, messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')

      setMessages((prev) => [...prev, { role: 'assistant', content: data.message }])
      if (data.entryUpdated) {
        setSavedCount((c) => c + 1)
        router.refresh()
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong — please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
  }

  // Chips that summarise what the entry contains
  const chips: { label: string; count: number }[] = [
    { label: 'emotion', count: entry.emotions?.length ?? 0 },
    { label: 'decision', count: entry.decisions?.length ?? 0 },
    { label: 'pattern', count: entry.patterns?.length ?? 0 },
    { label: 'question', count: entry.open_questions?.length ?? 0 },
    { label: 'context', count: entry.key_context?.length ?? 0 },
  ].filter((c) => c.count > 0)

  const SUGGESTIONS = [
    'Change the anxiety intensity to 0.2',
    'Add a new open question: ',
    'Remove the decision about ',
    'Add a pattern: ',
  ]

  return (
    <>
      {/* Trigger button */}
      <button
        id="entry-edit-btn"
        className="entry-edit-trigger"
        onClick={() => setOpen(true)}
        aria-label="Edit entry with AI"
        title="Edit entry with AI"
      >
        <span aria-hidden>✎</span> Edit with AI
      </button>

      {/* Drawer */}
      {open && (
        <>
          <div
            className="eed-backdrop"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="eed-drawer"
            role="dialog"
            aria-modal
            aria-label="Edit journal entry"
          >
            {/* Header */}
            <div className="eed-header">
              <div className="eed-header-left">
                <div className="chat-header-icon" aria-hidden style={{ width: 28, height: 28, fontSize: 14 }}>
                  ✦
                </div>
                <div>
                  <div className="eed-title">Edit Entry</div>
                  <div className="eed-subtitle">Tell me what to add or correct</div>
                </div>
              </div>
              <div className="eed-header-right">
                {savedCount > 0 && (
                  <span className="eed-saved-badge" aria-live="polite">
                    ✓ {savedCount} saved
                  </span>
                )}
                <button
                  className="icon-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Close editor"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Context bar */}
            <div className="eed-context-bar">
              <span className="eed-context-label">Loaded:</span>
              {chips.map((c) => (
                <span key={c.label} className="eed-chip">
                  {c.count} {c.label}{c.count !== 1 ? 's' : ''}
                </span>
              ))}
            </div>

            {/* Messages */}
            <div className="eed-messages">
              {messages.length === 0 ? (
                <div className="eed-empty">
                  <p className="eed-empty-text">What would you like to change?</p>
                  <div className="eed-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        className="eed-suggestion"
                        onClick={() => {
                          setInput(s)
                          textareaRef.current?.focus()
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`eed-msg eed-msg-${msg.role}`}
                  >
                    {msg.role === 'assistant' && (
                      <span className="eed-msg-icon" aria-hidden>✦</span>
                    )}
                    <div className="eed-msg-bubble">{msg.content}</div>
                  </div>
                ))
              )}

              {isLoading && (
                <div className="eed-msg eed-msg-assistant">
                  <span className="eed-msg-icon" aria-hidden>✦</span>
                  <div className="eed-msg-bubble eed-typing">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="eed-input-area">
              <div className="chat-input-wrapper">
                <textarea
                  ref={textareaRef}
                  className="chat-textarea eed-textarea"
                  placeholder="e.g. Change anxiety to 0.2, add a note about feeling overwhelmed…"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKey}
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  aria-label="Send"
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
