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

## 🔴 Bugs & Issues to Fix

### B1. `.env` file is tracked in git
The `.env` file containing real API keys and Supabase credentials is committed to the repository. The `.gitignore` likely doesn't cover it, or it was added before the ignore rule.

**Impact**: Security risk — keys are exposed in the git history.
**Fix**: Add `.env` to `.gitignore`, remove from tracking with `git rm --cached .env`, and rotate all exposed keys.

---

### B2. Claude API key is a placeholder but fallback logic still checks for it
The `ANTHROPIC_API_KEY` is set to `sk-ant-...` (a placeholder). The chat route has a check `!process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-...')` — but this is checking for the literal placeholder string. If a real key is ever set that starts with `sk-ant-...` (which all valid keys do), it would never match.

**Impact**: The Claude check `hasClaudeKey` is currently correct by accident (returns `false` because it starts with the placeholder), but it would also reject a real key that starts with `sk-ant-...`.
**Fix**: Change the validation to check `process.env.ANTHROPIC_API_KEY !== 'sk-ant-...'` (exact match against the placeholder) instead of `startsWith`.

---

### B3. `@anthropic-ai/sdk` is still a production dependency
The app exclusively uses Gemini, but `@anthropic-ai/sdk` (~0.95) remains in `dependencies`, increasing bundle size and cold start time.

**Impact**: Unnecessary dependency bloat.
**Fix**: Either remove it entirely or move to `devDependencies` if you plan to re-enable Claude later.

---

### B4. Comment mismatch in `embeddings.ts`
Line 28 says `// Pin to 1536 dims to match the existing vector(1536) SQL column.` but the original plan in `journal-app-plan.md` specifies `vector(768)` and the Phase 3 SQL migration also says `vector(768)`. The code is correct (using 1536), but one of them is stale.

**Impact**: Confusing — developer won't know which is the actual column dimension.
**Fix**: Update `journal-app-plan.md` Phase 3 SQL to reflect the actual `vector(1536)` dimension used in production.

---

### B5. RPC function comment in `embeddings.ts` references wrong dimension
The docstring for `match_journal_entries` at line 76 shows `p_embedding vector(768)` but the actual embedding dimension is 1536.

**Impact**: Would cause errors if someone recreates the RPC function from the comment.
**Fix**: Update the comment to `vector(1536)`.

---

### B6. No error displayed to user on auth callback failure
When `/auth/callback` fails (missing code or exchange error), it redirects to `/auth?error=auth_callback_failed` — but the auth page doesn't read or display this query parameter.

**Impact**: Users see the login page with no indication of what went wrong.
**Fix**: Read `searchParams.error` on the auth page and show an error banner.

---

### B7. Conversation delete doesn't cascade to journal entries
When deleting a conversation via `DELETE /api/conversations/[id]`, the associated journal entry (if synthesized) is not deleted. The orphaned entry still references the deleted `conversation_id`.

**Impact**: Orphaned data; navigating to the entry's conversation link would fail.
**Fix**: Either cascade delete in the DB (FK constraint) or delete the related entry in the API route.

---

## 🟡 Improvements

### I1. Missing `middleware.ts` — only `proxy.ts` exists
Next.js 16 uses `proxy.ts` instead of `middleware.ts`, which is correct. However, the proxy's `config.matcher` may not be running on API routes, meaning API routes rely solely on checking `getUser()` inside each handler. This is fine functionally, but a unified auth approach would be more robust.

**Suggestion**: Consider adding early-exit auth checks in the proxy for API routes too, reducing boilerplate.

---

### I2. No loading/skeleton state on page navigation
When navigating between `/chat?conv=X` conversations, there's no loading indicator — the page appears frozen while the server component fetches data.

**Suggestion**: Add a `loading.tsx` file in `app/chat/` with a skeleton UI.

---

### I3. Chat doesn't render markdown
AI responses are rendered as plain text (`white-space: pre-wrap`). If the AI returns markdown-like formatting (bold, lists), it shows raw characters.

**Suggestion**: Add lightweight markdown rendering (e.g. `react-markdown` or a custom parser) for assistant messages.

---

### I4. No confirmation or toast after synthesis
After synthesis completes, the only feedback is a small "✓ Saved" badge. There's no way to navigate to the created entry directly from the chat.

**Suggestion**: Show a toast/link like "Entry created — [View entry →]" that navigates to `/journal/[entryId]`.

---

### I5. Entry edit doesn't re-embed after modification
When the AI edits an entry via `<PATCH>`, the entry's `embedding` column is not re-generated. The embedding reflects the old pre-edit data.

**Suggestion**: Re-run `embedText(buildEntrySummary(...))` and update the embedding in the entry-edit API after a successful patch.

---

### I6. No rate limiting on API routes
All API routes accept unlimited requests. A malicious or buggy client could spam the chat or synthesis endpoints.

**Suggestion**: Add basic rate limiting via Vercel's edge config or a simple in-memory counter per user.

---

### I7. System prompt is visible in source code
The anti-sycophancy system prompt and synthesis prompt are hardcoded in the route files. While not a security issue per se, anyone inspecting the client-server traffic or reading the open-source code can see the full prompt.

**Suggestion**: Move prompts to environment variables or a Supabase config table if you want them private.

---

### I8. `maxDuration` only on synthesize, not on chat
The synthesize route has `maxDuration = 10` for Vercel Hobby, but the chat route (which also calls Gemini + RAG) doesn't set it. Streaming routes may behave differently, but it's worth being explicit.

**Suggestion**: Add `maxDuration` to the chat route as well.

---

### I9. No journal entries list page
There's no page to browse all journal entries at once. Users can only access entries through the sidebar or by direct URL. The original plan mentions a `/journal` list page.

**Suggestion**: Create `/journal/page.tsx` as a scrollable list of all entries.

---

### I10. `Supabase createClient()` is called per-render in ChatInterface
In `ChatInterface.tsx` (line 63), `createClient()` is called at the top level of the component — this runs on every render. While `createBrowserClient` is lightweight, it's still wasteful.

**Suggestion**: Memoize with `useMemo` or move to a context provider.

---

### I11. Duplicate interface definitions across files
The `Message`, `JournalEntry`, `PastConversation` interfaces are redefined in `ChatInterface.tsx`, `ConversationSidebar.tsx`, `JournalEntryCard.tsx`, `EntryEditButton.tsx`, and `embeddings.ts`.

**Suggestion**: Create a shared `lib/types.ts` and import from there.

---

### I12. Auth page is a client component — no SSR metadata
The auth page is `'use client'` so it can't export `metadata`. The page has no title or description set.

**Suggestion**: Either extract a server wrapper component or add `<Head>` tags / use `generateMetadata` in a layout.

---

### I13. Missing PWA icons
The manifest references `/icon-192.png` and `/icon-512.png`, but these files may not exist in `/public`.

**Suggestion**: Verify these files exist; generate them if missing.

---

### I14. Plan document (`journal-app-plan.md`) is stale
The plan still references:
- Claude as the primary LLM (now Gemini)
- `claude.ts` in the file structure (doesn't exist)
- `vector(768)` embedding dimension (now 1536)
- `text-embedding-004` model (now `gemini-embedding-001`)
- Doesn't mention entry editing, deletion, Google OAuth, or PWA features

**Suggestion**: Update the plan to reflect reality, or replace it with this document.

---

## 🟢 Phase 4 Features (From Plan, Not Yet Built)

| Feature | Priority | Effort |
|---|---|---|
| Prose journal entries — `prose_summary` field with narrative | Medium | Low |
| Entry browser — Calendar/timeline view | Medium | Medium |
| Pattern dashboard — Emotion/theme visualization over time | High | Medium |
| Conversation search — Semantic search across all conversations | Low | Medium |
| Export — Download journal as PDF or markdown | Low | Low |

---

## Recommended Priority Order

1. **B1** — Fix `.env` tracking (security — do immediately)
2. **B6** — Show auth callback errors to user
3. **B7** — Cascade conversation deletes to entries
4. **I5** — Re-embed entries after AI edits
5. **B4/B5** — Fix stale dimension references
6. **I2** — Add loading states
7. **I9** — Create journal entries list page
8. **I11** — Consolidate shared types
9. **B2** — Fix Claude key detection logic
10. **B3** — Remove unused Anthropic dependency
