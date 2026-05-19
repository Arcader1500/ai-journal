'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const EntryEditButton = dynamic(() => import('./EntryEditButton'), { ssr: false })

import { type JournalEntry } from '@/lib/types'

interface JournalEntryCardProps {
  entry: JournalEntry
  /** Called after a successful server-side delete so parents can update their list */
  onDeleted?: (id: string) => void
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function Section({
  title,
  icon,
  empty,
  children,
}: {
  title: string
  icon: string
  empty: boolean
  children: React.ReactNode
}) {
  if (empty) return null
  return (
    <div className="je-section">
      <div className="je-section-header">
        <span className="je-section-icon" aria-hidden>{icon}</span>
        <h3 className="je-section-title">{title}</h3>
      </div>
      <div className="je-section-body">{children}</div>
    </div>
  )
}

export default function JournalEntryCard({ entry, onDeleted }: JournalEntryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/journal-entries/${entry.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted?.(entry.id)
        // If viewing standalone entry page, go back to chat
        router.push('/chat')
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to delete entry:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const hasContent =
    entry.emotions?.length > 0 ||
    entry.decisions?.length > 0 ||
    entry.patterns?.length > 0 ||
    entry.open_questions?.length > 0 ||
    entry.key_context?.length > 0

  return (
    <article className="je-card" aria-label={`Journal entry from ${formatDate(entry.created_at)}`}>
      {/* Card header — always visible */}
      <button
        className="je-card-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        id={`je-toggle-${entry.id}`}
      >
        <div className="je-card-meta">
          <div className="je-card-date">{formatDate(entry.created_at)}</div>
          {entry.emotions?.length > 0 && (
            <div className="je-card-emotions-preview" aria-label="Top emotions">
              {entry.emotions.slice(0, 3).map((e) => (
                <span key={e.label} className="je-emotion-chip">
                  {e.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`je-chevron ${expanded ? 'je-chevron-open' : ''}`} aria-hidden>
          ›
        </span>
      </button>

      {/* Expandable body */}
      {expanded && (
        <div
          className="je-card-body"
          role="region"
          aria-labelledby={`je-toggle-${entry.id}`}
        >
          {!hasContent && (
            <p className="je-empty-note">No structured data was extracted for this entry.</p>
          )}

          {/* Emotions */}
          <Section
            title="Emotions"
            icon="◉"
            empty={!entry.emotions?.length}
          >
            <div className="je-emotions-list">
              {entry.emotions.map((e) => (
                <div key={e.label} className="je-emotion-row">
                  <span className="je-emotion-label">{e.label}</span>
                  <div className="je-intensity-track" aria-label={`Intensity ${Math.round(e.intensity * 100)}%`}>
                    <div
                      className="je-intensity-fill"
                      style={{ width: `${Math.round(e.intensity * 100)}%` }}
                    />
                  </div>
                  <span className="je-intensity-pct">{Math.round(e.intensity * 100)}%</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Decisions */}
          <Section
            title="Decisions"
            icon="◈"
            empty={!entry.decisions?.length}
          >
            <div className="je-list">
              {entry.decisions.map((d, i) => (
                <div key={i} className="je-decision-item">
                  <div className="je-decision-action">{d.action}</div>
                  {d.considered && (
                    <div className="je-decision-considered">
                      Considered: {d.considered}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Patterns */}
          <Section
            title="Patterns"
            icon="◎"
            empty={!entry.patterns?.length}
          >
            <div className="je-list">
              {entry.patterns.map((p, i) => (
                <div key={i} className="je-pattern-item">
                  <div className="je-pattern-theme">{p.theme}</div>
                  {p.note && <div className="je-pattern-note">{p.note}</div>}
                </div>
              ))}
            </div>
          </Section>

          {/* Open Questions */}
          <Section
            title="Open Questions"
            icon="◇"
            empty={!entry.open_questions?.length}
          >
            <ul className="je-questions-list">
              {entry.open_questions.map((q, i) => (
                <li key={i} className="je-question-item">{q}</li>
              ))}
            </ul>
          </Section>

          {/* Key Context */}
          <Section
            title="Key Context"
            icon="◆"
            empty={!entry.key_context?.length}
          >
            <div className="je-context-list">
              {entry.key_context.map((c, i) => (
                <div key={i} className="je-context-item">
                  <span className="je-context-entity">{c.entity}</span>
                  <span className="je-context-role">{c.role}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Actions row: Edit with AI + Delete */}
          <div className="je-edit-row">
            <EntryEditButton entry={entry} />
            <button
              className="je-delete-btn"
              onClick={handleDelete}
              disabled={isDeleting}
              aria-label="Delete this journal entry"
              title="Delete this journal entry"
            >
              {isDeleting ? (
                <><span className="spinner" aria-hidden /> Deleting…</>
              ) : (
                '🗑 Delete Entry'
              )}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
