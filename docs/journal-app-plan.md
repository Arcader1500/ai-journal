# Reflective Journal App — Development Plan

## Overview

A mobile-friendly journaling app where the user chats with an honest AI companion.
Each conversation can be manually synthesized into structured journal entries stored
in a vector-enabled database. Future conversations retrieve relevant past entries via
RAG to maintain long-term context without re-explaining.

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | Next.js 16 (App Router) | Web + mobile-friendly UI |
| Hosting | Vercel | Free tier deployment |
| Database | Supabase (PostgreSQL) | Structured storage |
| Vector Search | Supabase pgvector | RAG retrieval |
| Auth | Supabase Auth | User sessions (magic link + Google OAuth) |
| LLM (primary) | Gemini `gemini-3-flash-preview` | Chat + synthesis + entry editing |
| LLM (fallback) | Anthropic Claude (if key set) | Chat fallback |
| Embeddings | Gemini `gemini-embedding-001` | Vectorize journal entries (1536-dim) |

---

## Data Schema

### `conversations`
```sql
id            uuid primary key
user_id       uuid references auth.users
started_at    timestamp
messages      jsonb  -- full message history [{role, content, timestamp}]
synthesized   boolean default false
```

### `journal_entries`
```sql
id              uuid primary key
user_id         uuid references auth.users
conversation_id uuid references conversations
created_at      timestamp
emotions        jsonb   -- [{ label: "anxiety", intensity: 0.8 }]
decisions       jsonb   -- [{ action: "...", considered: "..." }]
patterns        jsonb   -- [{ theme: "...", note: "..." }]
open_questions  jsonb   -- ["..."]
key_context     jsonb   -- [{ person/situation: "..." }]
embedding       vector(1536)
```

---

## Phases

---

### Phase 1 — Foundation

**Goal:** Users can sign up, chat with the AI, and conversations are saved.

#### Tasks

1. **Supabase setup**
   - Create project
   - Enable pgvector extension
   - Create `conversations` table
   - Configure Supabase Auth (email/magic link)

2. **Next.js project init**
   - Create Next.js app with App Router
   - Install: `@supabase/supabase-js`, `@anthropic-ai/sdk`
   - Set up environment variables:
     ```
     NEXT_PUBLIC_SUPABASE_URL
     NEXT_PUBLIC_SUPABASE_ANON_KEY
     ANTHROPIC_API_KEY
     ```

3. **Auth flow**
   - Sign up / sign in page
   - Session management via Supabase Auth
   - Protect all app routes

4. **Chat UI**
   - Mobile-first chat interface
   - Message input + send
   - Auto-scroll to latest message
   - Display `user` and `assistant` messages distinctly

5. **Chat API route** (`/api/chat`)
   - Accept conversation history from client
   - Call Claude API with:
     - System prompt (anti-sycophancy, honest feedback, balanced validation)
     - Full message history
   - Stream or return response
   - Save updated conversation to Supabase

#### System Prompt (Phase 1)
```
You are a reflective journaling companion. Your role is to be an honest, 
non-sycophantic thinking partner. You should:
- Validate genuine feelings without inflating them
- Point out what the user handled well AND what they could have done differently
- Ask clarifying questions that deepen self-reflection
- Never tell the user only what they want to hear
- Be warm but honest
```

#### Milestone
User can log in, have a full conversation, and it persists across sessions.

---

### Phase 2 — Synthesis

**Goal:** Users can trigger synthesis on a conversation, generating structured journal entries.

#### Tasks

1. **Create `journal_entries` table** in Supabase (schema above, without embedding for now)

2. **Synthesis API route** (`/api/synthesize`)
   - Accept `conversation_id`
   - Fetch full conversation messages from Supabase
   - Call Claude API with synthesis prompt (see below)
   - Parse structured JSON response
   - Save to `journal_entries`
   - Mark `conversations.synthesized = true`

3. **Synthesis prompt**
```
You are analyzing a journaling conversation. Extract the following and return 
ONLY valid JSON, no markdown, no preamble:

{
  "emotions": [{ "label": string, "intensity": float 0-1 }],
  "decisions": [{ "action": string, "considered": string }],
  "patterns": [{ "theme": string, "note": string }],
  "open_questions": [string],
  "key_context": [{ "entity": string, "role": string }]
}

Be precise. Do not invent. Only extract what is explicitly present.
```

4. **UI: Synthesize button**
   - Shown on completed conversations
   - Shows loading state while processing
   - Shows confirmation when done

5. **UI: Journal entries view**
   - List past synthesized entries
   - Expandable cards per entry showing each field

#### Milestone
User can end a conversation, hit "Synthesize", and view the structured entry.

---

### Phase 3 — RAG + Continuity

**Goal:** The chat AI silently retrieves relevant past entries to maintain long-term context.

#### Strategy: Hybrid — First-message retrieval + on-demand tool call

Embedding on every message is wasteful. Instead:

1. **On the first user message** of a conversation → embed it → retrieve top 3 similar past entries → inject as system context for the entire session.
2. **Register a `search_past_entries` tool** the model can call mid-conversation if it encounters a reference it doesn't recognise (e.g. a person's name, "like last time", etc.).
3. **Graceful fallback** — if the user has no synthesized entries yet, skip RAG entirely.

#### Tasks

1. **Enable embeddings on synthesis**
   - After saving the `journal_entries` row, build a summary string from the structured fields
   - Call `gemini-embedding-001` (Gemini) via `embedContent` with 1536-dim output
   - Store result in `journal_entries.embedding` (vector(1536) column)

2. **`lib/embeddings.ts`** — shared helpers
   - `embedText(text: string): Promise<number[]>` — calls Gemini embedContent
   - `retrieveRelevantEntries(userId, queryEmbedding, limit): Promise<Entry[]>` — pgvector cosine search
   - `formatEntriesAsContext(entries): string` — renders entries as injected system text

3. **Chat API — first-message retrieval**
   - If `messages.length === 1` (first user turn in this session) AND user has ≥1 entry:
     - Embed the user's message
     - Retrieve top 3 entries
     - Prepend formatted context block to system prompt

4. **Chat API — `search_past_entries` tool**
   - Declare the tool in the Gemini chat call
   - If the model invokes it, embed the query string, run retrieval, and inject results as a tool response
   - Continue the stream with the enriched context

5. **SQL migration**
   ```sql
   -- Run once in Supabase SQL editor
   ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS embedding vector(1536);
   CREATE INDEX IF NOT EXISTS journal_entries_embedding_idx
     ON journal_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
   ```

#### Milestone
AI references past patterns naturally without the user needing to re-explain context.

---

### Phase 4 — Polish (Optional / Future)

- **Prose journal entries** — add a `prose_summary` field, generate readable narrative alongside structured data
- **Entry browser** — calendar view or timeline of past entries
- **Pattern dashboard** — visualize recurring emotions, decision themes over time
- **Conversation search** — semantic search across all past conversations
- **Export** — download journal as PDF or markdown

---

## File Structure

```
/app
  /api
    /admin/backfill-embeddings  route.ts  -- one-shot embedding backfill
    /chat                       route.ts  -- streaming chat (Gemini + RAG tool calling)
    /conversations/new          route.ts  -- POST create conversation
    /conversations/[id]         route.ts  -- DELETE conversation (blocks synthesized)
    /entry-edit                 route.ts  -- AI-assisted entry editing (PATCH protocol)
    /journal-entries/[id]       route.ts  -- DELETE journal entry
    /synthesize                 route.ts  -- conversation → structured journal entry
  /auth
    /callback                   route.ts  -- OAuth/magic link exchange
    page.tsx                              -- sign in/up (magic link + Google OAuth)
  /chat                         page.tsx  -- main chat interface (server component)
  /journal/[id]                 page.tsx  -- standalone entry detail page
  globals.css                             -- full design system (~1600 lines)
  layout.tsx                              -- root layout + PWA metadata
  manifest.ts                             -- PWA web manifest
  page.tsx                                -- root redirect → /chat
/lib
  embeddings.ts                           -- embed, retrieve, format, buildEntrySummary
  supabase/
    client.ts                             -- browser Supabase client
    server.ts                             -- server Supabase client (cookie-based)
/components
  ChatInput.tsx
  ChatInterface.tsx
  ChatMessage.tsx
  ConversationSidebar.tsx
  EntryEditButton.tsx
  JournalEntryCard.tsx
proxy.ts                                  -- Next.js 16 proxy middleware (auth + session refresh)
```

---

## Development Order

```
Phase 1 → deploy to Vercel → test on mobile → Phase 2 → test synthesis → Phase 3 → test RAG
```

Each phase is independently deployable and testable. Never blocked waiting for a future phase.
