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
| Frontend | Next.js (App Router) | Web + mobile-friendly UI |
| Hosting | Vercel | Free tier deployment |
| Database | Supabase (PostgreSQL) | Structured storage |
| Vector Search | Supabase pgvector | RAG retrieval |
| Auth | Supabase Auth | User sessions |
| LLM | Anthropic Claude API | Chat + synthesis |
| Embeddings | Anthropic Embeddings API | Vectorize journal entries |

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

#### Tasks

1. **Enable embeddings**
   - On synthesis, call Anthropic Embeddings API on a summary string of the entry
   - Store embedding in `journal_entries.embedding` (vector column)

2. **Retrieval function**
   - On each chat API call, embed the latest user message
   - Query Supabase pgvector for top 3 similar past entries:
     ```sql
     SELECT * FROM journal_entries
     WHERE user_id = $1
     ORDER BY embedding <=> $query_embedding
     LIMIT 3
     ```

3. **Inject context into chat**
   - Retrieved entries are passed as system context, not shown to user:
     ```
     [BACKGROUND CONTEXT - not visible to user]
     Relevant past journal entries:
     Entry 1 (2025-04-10): emotions: [...], patterns: [...], open_questions: [...]
     Entry 2 ...
     [END BACKGROUND CONTEXT]
     ```

4. **Graceful fallback**
   - If no entries exist yet, chat works normally without RAG
   - Only retrieve if user has at least 1 synthesized entry

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
    /chat         route.ts      -- chat with Claude
    /synthesize   route.ts      -- trigger synthesis
  /chat           page.tsx      -- chat interface
  /journal        page.tsx      -- view past entries
  /auth           page.tsx      -- sign in/up
/lib
  supabase.ts                   -- Supabase client
  claude.ts                     -- Claude API helpers
  embeddings.ts                 -- embedding + retrieval logic
/components
  ChatMessage.tsx
  ChatInput.tsx
  JournalEntryCard.tsx
```

---

## Development Order

```
Phase 1 → deploy to Vercel → test on mobile → Phase 2 → test synthesis → Phase 3 → test RAG
```

Each phase is independently deployable and testable. Never blocked waiting for a future phase.
