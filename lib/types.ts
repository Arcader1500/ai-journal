/**
 * Shared domain types used across components and API routes.
 * Import from here instead of redeclaring locally.
 */

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface JournalEntry {
  id: string
  created_at: string
  conversation_id?: string
  emotions: { label: string; intensity: number }[]
  decisions: { action: string; considered: string }[]
  patterns: { theme: string; note: string }[]
  open_questions: string[]
  key_context: { entity: string; role: string }[]
}

export interface Conversation {
  id: string
  started_at: string
  messages: { role: string; content: string }[]
  synthesized: boolean
  journal_entry_id?: string
}
