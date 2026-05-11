import { useRef, useEffect } from 'react'

interface ChatInputProps {
  value: string
  onChange: (val: string) => void
  onSend: () => void
  isLoading: boolean
}

export default function ChatInput({ value, onChange, onSend, isLoading }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && value.trim()) {
        onSend()
      }
    }
  }

  return (
    <div className="chat-input-area">
      <div className="chat-input-wrapper">
        <textarea
          id="chat-textarea"
          ref={textareaRef}
          className="chat-textarea"
          placeholder="What's on your mind?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={isLoading}
          aria-label="Message input"
          aria-multiline="true"
        />

        <button
          id="send-btn"
          className="send-btn"
          onClick={onSend}
          disabled={isLoading || !value.trim()}
          aria-label="Send message"
          title="Send (Enter)"
        >
          {isLoading ? (
            <span className="spinner" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>
      <p className="chat-hint">Enter to send · Shift+Enter for new line</p>
    </div>
  )
}
