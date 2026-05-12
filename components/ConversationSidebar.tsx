'use client'

import { useState } from 'react'
import Link from 'next/link'

interface PastConversation {
  id: string
  started_at: string
  messages: { role: string; content: string }[]
  synthesized: boolean
  journal_entry_id?: string
}

interface JournalEntry {
  id: string
  created_at: string
  emotions: { label: string; intensity: number }[]
  decisions: { action: string; considered: string }[]
  patterns: { theme: string; note: string }[]
  open_questions: string[]
  key_context: { entity: string; role: string }[]
}

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
  pastConversations: PastConversation[]
  journalEntries: JournalEntry[]
  activeConversationId: string
  onNewConversation: () => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function getPreview(messages: { role: string; content: string }[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return 'Empty session'
  return first.content.length > 60 ? first.content.slice(0, 60) + '…' : first.content
}

function getTopEmotions(emotions: { label: string; intensity: number }[]): string {
  if (!emotions?.length) return 'No emotions recorded'
  return emotions
    .slice(0, 3)
    .map((e) => e.label)
    .join(', ')
}

export default function ConversationSidebar({
  isOpen,
  onClose,
  pastConversations,
  journalEntries,
  activeConversationId,
  onNewConversation,
}: ConversationSidebarProps) {
  const [tab, setTab] = useState<'sessions' | 'entries'>('sessions')

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="sidebar-backdrop" onClick={onClose} aria-hidden />
      )}

      {/* Drawer */}
      <aside
        className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
        aria-label="Navigation"
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="sidebar-header">
          <h2 className="sidebar-title">AI Journal</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close sidebar">
            ✕
          </button>
        </div>

        {/* New Conversation */}
        <div className="sidebar-new-btn-wrap">
          <button
            id="new-conversation-btn"
            className="sidebar-new-btn"
            onClick={() => { onNewConversation(); onClose() }}
          >
            <span aria-hidden>＋</span> New Conversation
          </button>
        </div>

        {/* Tabs */}
        <div className="sidebar-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'sessions'}
            className={`sidebar-tab ${tab === 'sessions' ? 'sidebar-tab-active' : ''}`}
            onClick={() => setTab('sessions')}
          >
            Sessions
          </button>
          <button
            role="tab"
            aria-selected={tab === 'entries'}
            className={`sidebar-tab ${tab === 'entries' ? 'sidebar-tab-active' : ''}`}
            onClick={() => setTab('entries')}
          >
            Entries
          </button>
        </div>

        {/* Tab content */}
        <div className="sidebar-body">
          {/* ── Sessions tab ── */}
          {tab === 'sessions' && (
            <>
              {pastConversations.length === 0 ? (
                <p className="sidebar-empty">
                  Past sessions will appear here once you synthesize a conversation.
                </p>
              ) : (
                <ul className="sidebar-list">
                  {pastConversations.map((conv) => (
                    <li
                      key={conv.id}
                      className={`sidebar-item ${conv.id === activeConversationId ? 'sidebar-item-active' : ''}`}
                    >
                      <div className="sidebar-item-date">{formatDate(conv.started_at)}</div>
                      <div className="sidebar-item-preview">{getPreview(conv.messages)}</div>
                      <div className="sidebar-item-actions">
                        {conv.journal_entry_id && (
                          <Link
                            href={`/journal/${conv.journal_entry_id}`}
                            className="sidebar-action-link"
                            onClick={onClose}
                          >
                            View entry →
                          </Link>
                        )}
                        {conv.synthesized ? (
                          <span
                            className="sidebar-action-link sidebar-action-disabled"
                            title="Already synthesized — start a new conversation instead"
                          >
                            Continue ↩
                          </span>
                        ) : (
                          <Link
                            href={`/chat?conv=${conv.id}`}
                            className="sidebar-action-link sidebar-action-continue"
                            onClick={onClose}
                          >
                            Continue ↩
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* ── Entries tab ── */}
          {tab === 'entries' && (
            <>
              {journalEntries.length === 0 ? (
                <p className="sidebar-empty">
                  Synthesize a conversation to create your first journal entry.
                </p>
              ) : (
                <ul className="sidebar-list">
                  {journalEntries.map((entry) => (
                    <li key={entry.id} className="sidebar-item">
                      <Link
                        href={`/journal/${entry.id}`}
                        className="sidebar-item-link"
                        onClick={onClose}
                      >
                        <div className="sidebar-item-date">{formatDate(entry.created_at)}</div>
                        <div className="sidebar-item-preview">{getTopEmotions(entry.emotions)}</div>
                        {entry.emotions?.length > 0 && (
                          <div className="sidebar-item-chips">
                            {entry.emotions.slice(0, 3).map((e) => (
                              <span key={e.label} className="sidebar-item-emotion-chip">
                                {e.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}
