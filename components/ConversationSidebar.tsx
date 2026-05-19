'use client'

import { useState } from 'react'
import Link from 'next/link'

import { type Conversation } from '@/lib/types'

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
  allConversations: Conversation[]
  activeConversationId: string
  onNewConversation: () => void
  onConversationDeleted?: (id: string) => void
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


export default function ConversationSidebar({
  isOpen,
  onClose,
  allConversations,
  activeConversationId,
  onNewConversation,
  onConversationDeleted,
}: ConversationSidebarProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Split into in-progress (unsynthesized) and past (synthesized)
  const inProgress = allConversations.filter((c) => !c.synthesized)
  const past = allConversations.filter((c) => c.synthesized)

  async function handleDeleteConversation(id: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        onConversationDeleted?.(id)
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    } finally {
      setDeletingId(null)
    }
  }

  function ConvItem({ conv }: { conv: Conversation }) {
    const isActive = conv.id === activeConversationId
    const isDeleting = deletingId === conv.id
    return (
      <li className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''}`}>
        <div className="sidebar-item-top-row">
          <div className="sidebar-item-date">{formatDate(conv.started_at)}</div>
          {isActive && <span className="sidebar-badge-current">Current</span>}
          {conv.synthesized && !isActive && (
            <span className="sidebar-badge-synth">Saved</span>
          )}
        </div>
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
          {!isActive && (
            conv.synthesized ? (
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
            )
          )}
          <button
            className="sidebar-delete-btn"
            onClick={() => handleDeleteConversation(conv.id)}
            disabled={isDeleting || conv.synthesized}
            aria-label="Delete conversation"
            title={conv.synthesized ? 'Cannot delete a synthesized conversation' : 'Delete this conversation'}
          >
            {isDeleting ? '…' : '🗑'}
          </button>
        </div>
      </li>
    )
  }

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

        {/* Journal Entries link */}
        <div className="sidebar-new-btn-wrap" style={{ paddingTop: 8 }}>
          <Link
            href="/journal"
            id="journal-entries-btn"
            className="sidebar-journal-btn"
            onClick={onClose}
          >
            <span aria-hidden>✦</span> Journal Entries →
          </Link>
        </div>

        {/* Sessions label */}
        <div className="sidebar-section-header">Past Sessions</div>

        {/* Sessions list */}
        <div className="sidebar-body">
          {allConversations.length === 0 ? (
            <p className="sidebar-empty">No sessions yet. Start chatting!</p>
          ) : (
            <ul className="sidebar-list">
              {inProgress.length > 0 && (
                <>
                  <li className="sidebar-section-label">In Progress</li>
                  {inProgress.map((conv) => (
                    <ConvItem key={conv.id} conv={conv} />
                  ))}
                </>
              )}

              {past.length > 0 && (
                <>
                  <li className="sidebar-section-label">Synthesized</li>
                  {past.map((conv) => (
                    <ConvItem key={conv.id} conv={conv} />
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
