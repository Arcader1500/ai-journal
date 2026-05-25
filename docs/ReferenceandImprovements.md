# AI Journal — Feature Audit & Improvement Roadmap

Complete reference of every implemented feature, followed by actionable bugs, gaps, and improvements discovered through a full code review.

---

## Tech Stack (Current)

| Layer | Tool | Status |
|---|---|---|
| Frontend | Next.js 16 (App Router) + React 19 | ✅ Active |
| Hosting | Vercel | ✅ Deployed |
| Database | Supabase (PostgreSQL) | ✅ Active |
| Vector Search | Supabase pgvector (1536-dim) | ✅ Active |
| Auth | Supabase Auth (Magic Link + Google OAuth) | ✅ Active |
| LLM — Chat | Gemini `gemini-3-flash-preview` (Claude as fallback) | ✅ Active |
| LLM — Synthesis | Gemini `gemini-3-flash-preview` | ✅ Active |
| LLM — Entry Edit | Gemini `gemini-3-flash-preview` | ✅ Active |
| Embeddings | Gemini `gemini-embedding-001` (1536 dims) | ✅ Active |
| Font | Inter (Google Fonts) | ✅ Active |
| PWA | Web manifest + Apple Web App meta | ✅ Configured |

---

## Implemented Features

### Phase 1 — Foundation ✅ Complete

#### 1.1 Authentication
- [x] **Magic Link email sign-in** — OTP via Supabase Auth
- [x] **Google OAuth sign-in** — `signInWithOAuth` with Google provider
- [x] **Auth callback** — Code exchange at `/auth/callback` with redirect to `/chat`
- [x] **Session persistence** — Proxy middleware (`proxy.ts`) refreshes tokens on every request
- [x] **Route protection** — Unauthenticated users redirected to `/auth`; authenticated users redirected away from `/auth`
- [x] **Sign out** — Client-side `auth.signOut()` from chat header

#### 1.2 Chat Interface
- [x] **Mobile-first chat UI** — Dark mode, max-width 760px, `100dvh` layout
- [x] **Streaming AI responses** — Real-time text streaming via `ReadableStream`
- [x] **Message display** — User and assistant bubbles with avatars and timestamps
- [x] **Typing indicator** — Animated bouncing dots during AI response
- [x] **Auto-scroll** — Smooth scroll to latest message
- [x] **Auto-resize textarea** — Grows up to 140px
- [x] **Keyboard shortcuts** — Enter to send, Shift+Enter for newline
- [x] **Empty state** — Friendly prompt when no messages exist
- [x] **Error recovery** — Reverts messages and input on API failure

#### 1.3 Conversation Management
- [x] **Auto-create conversation** — New conversation created on page load if none exists for today
- [x] **Continue conversation** — Resume via `?conv=<id>` URL param
- [x] **New Conversation button** — Creates via `POST /api/conversations/new`
- [x] **Conversation persistence** — Full message history saved to Supabase after each exchange
- [x] **Delete conversation** — `DELETE /api/conversations/[id]` with ownership check
- [x] **Active conversation redirect** — After deleting current conversation, auto-creates a new one

#### 1.4 Sidebar
- [x] **Slide-in drawer** — Animated sidebar with backdrop
- [x] **Two tabs** — "Sessions" and "Entries"
- [x] **In-Progress / Past split** — Sessions tab separates unsynthesized vs. synthesized
- [x] **Conversation preview** — First user message truncated to 60 chars
- [x] **Continue conversation link** — For unsynthesized sessions
- [x] **View entry link** — Links to `/journal/[id]` for synthesized conversations
- [x] **Active session indicator** — "Current" badge on active conversation
- [x] **Delete from sidebar** — Conversation and entry deletion with confirmation

---

### Phase 2 — Synthesis ✅ Complete

#### 2.1 Synthesis Pipeline
- [x] **Synthesize button** — Header button, shown when conversation has messages and isn't synthesized
- [x] **AI extraction** — Gemini extracts structured JSON: emotions, decisions, patterns, open_questions, key_context
- [x] **JSON response mode** — `responseMimeType: 'application/json'` for reliable parsing
- [x] **Message truncation** — Last 30 messages to stay within Vercel Hobby timeout
- [x] **Idempotency** — Rejects if conversation already synthesized (409)
- [x] **Loading state** — Spinner + "Saving…" during synthesis
- [x] **Success badge** — "✓ Saved" after completion
- [x] **Error display** — Warning icon with tooltip on failure

#### 2.2 Journal Entry Display
- [x] **Expandable entry cards** — Collapse/expand with chevron animation
- [x] **Emotion section** — Labels with intensity bars (0–100%)
- [x] **Decisions section** — Action + what was considered
- [x] **Patterns section** — Theme + note
- [x] **Open Questions section** — Bulleted list
- [x] **Key Context section** — Entity + role
- [x] **Empty state handling** — Message when no structured data extracted
- [x] **Standalone entry page** — `/journal/[id]` with back navigation

#### 2.3 Entry Editing
- [x] **"Edit with AI" button** — Bottom of each entry card
- [x] **Slide-up drawer** — Full chat interface for editing
- [x] **Context chips** — Shows loaded field counts (e.g. "3 emotions, 2 decisions")
- [x] **Suggestion chips** — Pre-built edit prompts
- [x] **PATCH protocol** — AI responds with `<PATCH>{...}</PATCH>` blocks that are parsed and applied
- [x] **Saved counter** — Shows how many edits have been applied
- [x] **Auto-refresh** — Router refresh after successful edit
- [x] **Escape to close** — Keyboard shortcut

#### 2.4 Entry Management
- [x] **Delete entry** — From entry card and sidebar, with confirmation dialog
- [x] **Delete API** — `DELETE /api/journal-entries/[id]` with ownership check
- [x] **Post-delete redirect** — Returns to `/chat` after deleting from standalone page

---

### Phase 3 — RAG + Continuity ✅ Complete

#### 3.1 Embedding Pipeline
- [x] **Embedding on synthesis** — Auto-generates embedding from structured entry summary
- [x] **Embedding model** — `gemini-embedding-001` with 1536 dimensions
- [x] **Summary builder** — Combines emotions, patterns, decisions, questions, context into a single string
- [x] **Non-fatal embedding** — Synthesis succeeds even if embedding fails

#### 3.2 First-Message Retrieval
- [x] **RAG on first turn** — Embeds the user's first message, retrieves top-3 similar entries
- [x] **Context injection** — Prepends formatted entries to system prompt as `[BACKGROUND CONTEXT]`
- [x] **Graceful skip** — No RAG if user has no entries or it's not the first message
- [x] **Non-fatal RAG** — Chat continues even if retrieval errors

#### 3.3 On-Demand Tool Call
- [x] **`search_past_entries` tool** — Declared in Gemini function calling schema
- [x] **Agentic loop** — Handles tool calls mid-conversation, executes retrieval, sends results back
- [x] **Tool result injection** — Returns formatted entries as function response

#### 3.4 Admin Utilities
- [x] **Backfill embeddings** — `POST /api/admin/backfill-embeddings` for entries missing embeddings
- [x] **Idempotent** — Skips entries that already have embeddings

---

### Infrastructure & Polish

#### PWA / Mobile
- [x] **Web manifest** — Name, icons (192px + 512px), standalone display, portrait orientation
- [x] **Apple Web App** — `capable: true`, `black-translucent` status bar
- [x] **Theme color** — `#7c6ef7` (indigo accent)
- [x] **Viewport** — `maximumScale: 1` to prevent zoom on mobile

#### Design System
- [x] **CSS custom properties** — 30+ design tokens for colors, spacing, shadows, transitions
- [x] **Dark mode** — Pure dark theme with indigo accent
- [x] **Animations** — `fadeUp`, `fadeIn`, `float`, `typingBounce`, `spin`
- [x] **Glassmorphism** — Backdrop blur on header and sidebar backdrop
- [x] **Custom scrollbar** — Thin styled scrollbar, hidden on mobile

#### SEO
- [x] **Page-level metadata** — Unique title + description for `/chat`, `/journal/[id]`, `/auth`
- [x] **Root metadata** — Keywords, description, apple web app config
- [x] **Semantic HTML** — `<header>`, `<main>`, `<article>`, `<aside>`, proper heading hierarchy
- [x] **ARIA attributes** — `aria-live`, `aria-label`, `aria-expanded`, `role` attributes throughout

---

## File Architecture

```
app/
├── api/
│   ├── admin/backfill-embeddings/route.ts   — Embedding backfill utility
│   ├── chat/route.ts                        — Chat streaming (Gemini/Claude + RAG)
│   ├── conversations/
│   │   ├── [id]/route.ts                    — DELETE conversation
│   │   └── new/route.ts                     — POST create conversation
│   ├── entry-edit/route.ts                  — AI-powered entry editing
│   ├── journal-entries/[id]/route.ts        — DELETE journal entry
│   └── synthesize/route.ts                  — Conversation → structured entry
├── auth/
│   ├── callback/route.ts                    — OAuth/Magic Link callback
│   └── page.tsx                             — Sign-in UI
├── chat/page.tsx                            — Main chat page (server component)
├── journal/[id]/page.tsx                    — Standalone entry detail page
├── globals.css                              — Full design system (1638 lines)
├── layout.tsx                               — Root layout + metadata
├── manifest.ts                              — PWA manifest
└── page.tsx                                 — Root redirect → /chat

components/
├── ChatInput.tsx                            — Auto-resize textarea + send button
├── ChatInterface.tsx                        — Main chat orchestrator (client)
├── ChatMessage.tsx                          — Message bubble component
├── ConversationSidebar.tsx                  — Sidebar drawer with tabs
├── EntryEditButton.tsx                      — AI edit drawer
└── JournalEntryCard.tsx                     — Expandable structured entry card

lib/
├── embeddings.ts                            — Embed, retrieve, format, buildEntrySummary
└── supabase/
    ├── client.ts                            — Browser Supabase client
    └── server.ts                            — Server Supabase client (cookies)

proxy.ts                                     — Next.js 16 proxy middleware (auth + session)
```

---


