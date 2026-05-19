'use client'

import ReactMarkdown from 'react-markdown'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

function formatTime(ts?: string): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function ChatMessage({ role, content, timestamp }: MessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`message-wrapper ${role}`} role="article" aria-label={`${role} message`}>
      {/* Avatar */}
      <div className={`message-avatar ${role}`} aria-hidden>
        {isUser ? '👤' : '✦'}
      </div>

      {/* Bubble + timestamp */}
      <div className="message-body">
        <div className={`message-bubble ${role}`}>
          {isUser ? (
            content
          ) : (
            <ReactMarkdown
              components={{
                // Open links in new tab for safety
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
        {timestamp && (
          <span className="message-time">{formatTime(timestamp)}</span>
        )}
      </div>
    </div>
  )
}
