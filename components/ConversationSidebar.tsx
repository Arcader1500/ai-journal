'use client'

interface PastConversation {
  id: string
  started_at: string
  messages: { role: string; content: string }[]
  synthesized: boolean
}

interface ConversationSidebarProps {
  isOpen: boolean
  onClose: () => void
  pastConversations: PastConversation[]
  activeConversationId: string
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
  return first.content.length > 60
    ? first.content.slice(0, 60) + '…'
    : first.content
}

export default function ConversationSidebar({
  isOpen,
  onClose,
  pastConversations,
  activeConversationId,
}: ConversationSidebarProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Drawer */}
      <aside
        className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
        aria-label="Past conversations"
        aria-hidden={!isOpen}
      >
        <div className="sidebar-header">
          <h2 className="sidebar-title">Past Sessions</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-body">
          {pastConversations.length === 0 ? (
            <p className="sidebar-empty">
              Synthesized conversations will appear here after you&apos;re done chatting.
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
                  <div className="sidebar-item-badge">Synthesized</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
