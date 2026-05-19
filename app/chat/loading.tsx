export default function ChatLoading() {
  return (
    <div className="chat-loading-overlay" aria-label="Loading conversation…" role="status">
      <div className="chat-loading-spinner" aria-hidden />
      <span className="chat-loading-label">Loading…</span>
    </div>
  )
}
