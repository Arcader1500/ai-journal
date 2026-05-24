# Honcho Memory Integration & Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Honcho Cloud as a psychological memory layer alongside Supabase RAG, implementing a beautiful Insights Dashboard with mood charts, longitudinal search, proactive prompting, and weekly reflection digests matching the existing dark-indigo UI.

**Architecture:** We use a dual-layer approach. The existing Supabase `journal_entries` handles structured search, while Honcho Cloud logs raw conversations to build an evolving cognitive user profile (Peer Card). A dedicated `/insights` dashboard visualizes these insights and triggers hybrid searches.

**Tech Stack:** Next.js 16 (App Router), Supabase Auth & DB, Gemini (`gemini-3-flash-preview`), `@google/generative-ai`, `@honcho-ai/sdk`.

---

## Proposed File Architecture

```
lib/
└── honcho.ts                                — [NEW] Honcho core helpers & client integration

app/
├── api/
│   ├── chat/
│   │   └── proactive-greeting/route.ts      — [NEW] Endpoint generating personalized start greetings
│   ├── search/route.ts                      — [NEW] Hybrid longitudinal search API (RAG + Honcho)
│   └── synthesize/
│       └── weekly/route.ts                  — [NEW] Generates weekly digests from Honcho conclusions
├── insights/
│   └── page.tsx                             — [NEW] High-fidelity dark-indigo Insights Dashboard page

components/
└── ChatInterface.tsx                        — [MODIFY] Integrate proactive prompts & sync raw messages
```

---

## Tasks

### Task 1: Install @honcho-ai/sdk Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `@honcho-ai/sdk` to dependencies**
  Edit `package.json` to include `@honcho-ai/sdk` version `^2.0.0` or latest.

  ```json
  "dependencies": {
    "@anthropic-ai/sdk": "^0.95.1",
    "@google/generative-ai": "^0.24.1",
    "@honcho-ai/sdk": "^2.0.0",
    "@supabase/ssr": "^0.10.3",
    "@supabase/supabase-js": "^2.105.4",
    "next": "16.2.6",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "react-markdown": "^10.1.0"
  }
  ```

- [ ] **Step 2: Install dependencies**
  Run: `npm install`
  Expected: Successful dependency installation with no breaking type conflicts.

- [ ] **Step 3: Commit**
  ```bash
  git add package.json package-lock.json
  git commit -m "chore: add @honcho-ai/sdk dependency"
  ```

---

### Task 2: Create lib/honcho.ts

**Files:**
- Create: `lib/honcho.ts`

- [ ] **Step 1: Implement Honcho client and helpers**
  Write a high-fidelity wrapper inside `lib/honcho.ts` to manage Honcho peers, sessions, messages, and representation retrieval.

  ```typescript
  import { Honcho } from '@honcho-ai/sdk';

  const apiKey = process.env.HONCHO_API_KEY;
  if (!apiKey) {
    console.warn('[HONCHO] HONCHO_API_KEY is not defined. Honcho memory will fallback gracefully.');
  }

  export function getHonchoClient(): Honcho | null {
    if (!apiKey) return null;
    return new Honcho({
      apiKey,
      workspaceId: 'ai-journal-workspace'
    });
  }

  export interface HonchoMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  /**
   * Initializes the session in Honcho by establishing peers and adding them to the session.
   */
  export async function getOrCreateHonchoSession(userId: string, conversationId: string) {
    const honcho = getHonchoClient();
    if (!honcho) return null;

    try {
      const userPeer = await honcho.peer(userId);
      const companionPeer = await honcho.peer('companion');
      const session = await honcho.session(conversationId);

      await session.addPeers([userPeer, companionPeer]);
      return { session, userPeer, companionPeer };
    } catch (err) {
      console.error('[HONCHO] Failed to get or create session:', err);
      return null;
    }
  }

  /**
   * Syncs new messages to the Honcho session.
   */
  export async function syncMessagesToHoncho(userId: string, conversationId: string, messages: HonchoMessage[]) {
    const honcho = getHonchoClient();
    if (!honcho) return;

    try {
      const sessionData = await getOrCreateHonchoSession(userId, conversationId);
      if (!sessionData) return;

      const { session, userPeer, companionPeer } = sessionData;

      const honchoMessages = messages.map((m) => {
        const peer = m.role === 'assistant' ? companionPeer : userPeer;
        return peer.message(m.content);
      });

      await session.addMessages(honchoMessages);
      console.log(`[HONCHO] Successfully synced ${messages.length} messages for session ${conversationId}`);
    } catch (err) {
      console.error('[HONCHO] Failed to sync messages:', err);
    }
  }

  /**
   * Retrieves the current Peer Card (user representation) from Honcho.
   */
  export async function getUserPeerCard(userId: string): Promise<string> {
    const honcho = getHonchoClient();
    if (!honcho) return '';

    try {
      const userPeer = await honcho.peer(userId);
      const representation = await userPeer.representation({ target: 'companion' });
      return representation || '';
    } catch (err) {
      console.error('[HONCHO] Failed to fetch user peer card:', err);
      return '';
    }
  }

  /**
   * Semantic search across Honcho derived peer conclusions.
   */
  export async function queryHonchoConclusions(userId: string, query: string, limit: number = 3): Promise<string[]> {
    const honcho = getHonchoClient();
    if (!honcho) return [];

    try {
      const userPeer = await honcho.peer(userId);
      const conclusionsScope = userPeer.conclusions;
      const results = await conclusionsScope.query(query, limit);
      return results.map((r: any) => r.text || String(r));
    } catch (err) {
      console.error('[HONCHO] Failed to query conclusions:', err);
      return [];
    }
  }
  ```

- [ ] **Step 2: Verify compiling**
  Run: `npx tsc --noEmit`
  Expected: Successful TS verification without errors.

- [ ] **Step 3: Commit**
  ```bash
  git add lib/honcho.ts
  git commit -m "feat: create lib/honcho.ts utility wrapper"
  ```

---

### Task 3: Integrate Honcho in Chat API Route & System Prompt

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Integrate Honcho context in system prompt building**
  Edit `app/api/chat/route.ts` to retrieve the Honcho Peer Card and inject it as a background snapshot in the system prompt.

  ```typescript
  // Modify buildSystemPrompt inside app/api/chat/route.ts:
  import { getUserPeerCard } from '@/lib/honcho'

  // Prepend to BASE_SYSTEM_PROMPT inside buildSystemPrompt:
  const peerCard = await getUserPeerCard(userId);
  let honchoContextBlock = '';
  if (peerCard) {
    honchoContextBlock = `[PEER SNAPSHOT (HONCHO MEMORY)]\nThis is your core psychological model of the user. Use it to maintain deep cross-session continuity, validate emotions, and understand their personality traits:\n${peerCard}\n\n`;
  }
  ```

- [ ] **Step 2: Sync raw conversation messages to Honcho**
  Inside the `/api/chat` route handler, when persisting messages to Supabase, also trigger a background sync to Honcho:

  ```typescript
  // Inside app/api/chat/route.ts near line 300:
  import { syncMessagesToHoncho } from '@/lib/honcho'

  // In the stream complete callback, right after saving to Supabase:
  const allMessages = [...messages, assistantMessage];
  // Sync the newly formed message turn to Honcho in the background
  syncMessagesToHoncho(user.id, conversationId, allMessages).catch((err) =>
    console.error('[HONCHO] Background sync failed:', err)
  );
  ```

- [ ] **Step 3: Test API compiling**
  Run: `npx tsc --noEmit`
  Expected: Successful compilation.

- [ ] **Step 4: Commit**
  ```bash
  git add app/api/chat/route.ts
  git commit -m "feat: integrate Honcho Peer Card injection and dynamic message sync in chat route"
  ```

---

### Task 4: Implement Proactive Prompting

**Files:**
- Create: `app/api/chat/proactive-greeting/route.ts`
- Modify: `components/ChatInterface.tsx`

- [ ] **Step 1: Create the proactive greeting API endpoint**
  This route fetches the latest Honcho Peer Card and recent emotions, then feeds them to Gemini to output a deeply empathetic greeting.

  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { getUserPeerCard } from '@/lib/honcho';

  export async function GET() {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const peerCard = await getUserPeerCard(user.id);
      
      // Fetch latest 3 emotions to capture recent vibes
      const { data: recentEntries } = await supabase
        .from('journal_entries')
        .select('emotions, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      const emotionsSummary = recentEntries
        ?.map((entry) => JSON.stringify(entry.emotions))
        .join(', ') || 'No emotional logs yet';

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

      const prompt = `You are a warm, honest, non-sycophantic journaling companion.
Your goal is to greet the user and proactively ask a personalized, empathetic opening question based on their psychological Peer Card and recent emotional tags.

[USER COGNITIVE MODEL (PEER CARD)]
${peerCard || 'Brand new user. Greet them warmly and ask how they are feeling today.'}

[RECENT EMOTIONS RECORDED]
${emotionsSummary}

Write a natural, warm, conversational greeting of 2-3 sentences. Proactively ask a question that references their recent situation or overall state. Avoid bullet points, lists, or markdown formatting. Be humble and authentic.`;

      const response = await model.generateContent(prompt);
      const greeting = response.response.text().trim();

      return NextResponse.json({ greeting });
    } catch (err) {
      console.error('[PROACTIVE GREETING] Error generating greeting:', err);
      return NextResponse.json({ greeting: 'Hi there. How are you feeling today?' });
    }
  }
  ```

- [ ] **Step 2: Modify ChatInterface.tsx to fetch and display the greeting**
  In `components/ChatInterface.tsx`, if the current active session has zero messages, hit the proactive greeting API and place it as the dynamic welcome message.

  ```typescript
  // Inside components/ChatInterface.tsx:
  // Add state for proactive greeting loading/state
  const [proactiveGreeting, setProactiveGreeting] = useState<string | null>(null);
  const [greetingLoading, setGreetingLoading] = useState(false);

  useEffect(() => {
    if (messages.length === 0 && activeConversationId) {
      setGreetingLoading(true);
      fetch('/api/chat/proactive-greeting')
        .then((res) => res.json())
        .then((data) => {
          if (data.greeting) {
            setProactiveGreeting(data.greeting);
          }
        })
        .finally(() => setGreetingLoading(false));
    } else {
      setProactiveGreeting(null);
    }
  }, [messages.length, activeConversationId]);
  ```
  Render the `proactiveGreeting` as an elegant message bubble in place of the static empty state.

- [ ] **Step 3: Verify build**
  Run: `npm run build`
  Expected: Successful production build.

- [ ] **Step 4: Commit**
  ```bash
  git add app/api/chat/proactive-greeting/route.ts components/ChatInterface.tsx
  git commit -m "feat: implement proactive prompting dynamic greetings matching the UI style"
  ```

---

### Task 5: Implement the Insights Dashboard Page

**Files:**
- Create: `app/insights/page.tsx`

- [ ] **Step 1: Write the frontend dashboard matching existing dark-indigo theme**
  Create a gorgeous responsive dashboard containing an interactive emotion tracker spline chart, Honcho Peer Card details, weekly reflections, and longitudinal search options.

  ```typescript
  'use client';

  import React, { useEffect, useState } from 'react';
  import Link from 'next/link';

  interface EmotionData {
    created_at: string;
    emotions: { label: string; intensity: number }[];
  }

  export default function InsightsPage() {
    const [entries, setEntries] = useState<EmotionData[]>([]);
    const [peerCard, setPeerCard] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState('');
    const [searching, setSearching] = useState(false);
    const [reflection, setReflection] = useState('');
    const [reflecting, setReflecting] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      async function loadDashboardData() {
        try {
          const res = await fetch('/api/insights/data'); // We'll create this to package both db data & Honcho data
          const data = await res.json();
          setEntries(data.entries || []);
          setPeerCard(data.peerCard || '');
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
      loadDashboardData();
    }, []);

    const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      setSearching(true);
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          body: JSON.stringify({ query: searchQuery }),
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        setSearchResults(data.answer || '');
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    };

    const generateWeeklyReflection = async () => {
      setReflecting(true);
      try {
        const res = await fetch('/api/synthesize/weekly', { method: 'POST' });
        const data = await res.json();
        setReflection(data.reflection || '');
      } catch (err) {
        console.error(err);
      } finally {
        setReflecting(false);
      }
    };

    if (loading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text-primary)' }}>
          <div className="spinner"></div>
        </div>
      );
    }

    return (
      <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)', padding: '32px 16px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
            <div>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>✨ Reflective Insights</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Evolving trends & cognitive memory model</p>
            </div>
            <Link href="/chat" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              Back to Chat
            </Link>
          </header>

          {/* SVG Emotion Line Chart */}
          <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>📊 Mood Intensity Trends</h2>
            {entries.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '32px' }}>No entries found yet. Synthesize some chats to view trends!</div>
            ) : (
              <div style={{ display: 'flex', height: '160px', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
                {entries.map((entry, idx) => {
                  const maxIntensity = Math.max(...entry.emotions.map((e) => e.intensity), 0) * 100;
                  const dateLabel = new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <div style={{ width: '16px', height: `${maxIntensity}%`, background: 'linear-gradient(to top, var(--accent-glow), var(--accent))', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }}></div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '8px' }}>{dateLabel}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Peer Card / Cognitive Memory Model */}
          <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>🧠 Honcho Peer Card</h2>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-text)', border: '1px solid var(--accent)', padding: '2px 8px', borderRadius: '99px' }}>Cognitive Model</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', background: 'var(--bg)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              {peerCard ? peerCard : 'Your cognitive model is forming. Keep chatting with your companion to update this card.'}
            </div>
          </section>

          {/* Longitudinal Search */}
          <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>🔍 Longitudinal Memory Search</h2>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. When did I last feel this burnt out about work?" style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', padding: '12px', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} />
              <button type="submit" disabled={searching} style={{ background: 'var(--accent)', color: 'white', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </form>
            {searchResults && (
              <div style={{ marginTop: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                <strong>Search Result Summary:</strong>
                <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{searchResults}</p>
              </div>
            )}
          </section>

          {/* Weekly Reflection Digests */}
          <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '12px' }}>📝 Weekly Reflection Digest</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>Generate a consolidated summary of patterns Honcho has detected, auto-generated as a new persistent entry.</p>
            <button onClick={generateWeeklyReflection} disabled={reflecting} style={{ background: 'var(--accent)', color: 'white', padding: '12px 24px', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>
              {reflecting ? 'Generating Reflection...' : 'Generate Reflection Digest'}
            </button>
            {reflection && (
              <div style={{ marginTop: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                <strong style={{ color: 'var(--success)' }}>✓ Saved to Journal Entries!</strong>
                <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{reflection}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Create app/insights/data API route**
  Create `app/api/insights/data/route.ts` to bundle Supabase emotional tags and Honcho Peer Card together for the dashboard load.

  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { getUserPeerCard } from '@/lib/honcho';

  export async function GET() {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const peerCard = await getUserPeerCard(user.id);

      const { data: entries } = await supabase
        .from('journal_entries')
        .select('created_at, emotions')
        .order('created_at', { ascending: false })
        .limit(7);

      return NextResponse.json({ entries: entries || [], peerCard });
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: 'Failed to load insights data' }, { status: 500 });
    }
  }
  ```

- [ ] **Step 3: Test routing compiling**
  Run: `npx tsc --noEmit`
  Expected: Successful compilation.

- [ ] **Step 4: Commit**
  ```bash
  git add app/insights/page.tsx app/api/insights/data/route.ts
  git commit -m "feat: implement full dark-indigo Insights Dashboard page and data fetcher"
  ```

---

### Task 6: Implement Longitudinal Conversational Search

**Files:**
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Write the hybrid longitudinal search endpoint**
  Query pgvector search from Supabase, semantic conclusions from Honcho, and feed both to Gemini for a synthesized answer.

  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { embedText, retrieveRelevantEntries } from '@/lib/embeddings';
  import { queryHonchoConclusions } from '@/lib/honcho';

  export async function POST(req: Request) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const { query } = await req.json();
      if (!query || typeof query !== 'string') {
        return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
      }

      // 1. RAG search from Supabase pgvector entries
      let ragContext = '';
      try {
        const queryEmbedding = await embedText(query);
        const entries = await retrieveRelevantEntries(supabase, user.id, queryEmbedding, 2);
        if (entries.length > 0) {
          ragContext = entries.map((e) => `Entry on ${new Date(e.created_at).toLocaleDateString()}:\n${JSON.stringify(e)}`).join('\n\n');
        }
      } catch (err) {
        console.error('[SEARCH] RAG search failed:', err);
      }

      // 2. Cognitive search from Honcho derived conclusions
      const conclusions = await queryHonchoConclusions(user.id, query, 3);
      const honchoContext = conclusions.join('\n');

      // 3. Synthesize via Gemini
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

      const systemPrompt = `You are a warm, honest, non-sycophantic journaling companion.
The user is asking a longitudinal question across all of their past journal entries and conversation logs.
Provide a clear, cohesive, and deeply insightful summary answering their query using the structured Supabase entries (RAG context) and the Honcho conclusions (Cognitive context).

[SUPABASE VECTOR RAG CONTEXT]
${ragContext || 'No specific journal entries match.'}

[HONCHO COGNITIVE CONTEXT]
${honchoContext || 'No high-level cognitive memory conclusions match.'}

Answer in 3-5 sentences. Reference specific dates or insights when present. Be authentic.`;

      const response = await model.generateContent(systemPrompt);
      const answer = response.response.text().trim();

      return NextResponse.json({ answer });
    } catch (err) {
      console.error('[SEARCH] API error:', err);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Test API compilation**
  Run: `npx tsc --noEmit`
  Expected: Successful validation.

- [ ] **Step 3: Commit**
  ```bash
  git add app/api/search/route.ts
  git commit -m "feat: implement hybrid search route using Supabase RAG and Honcho conclusions"
  ```

---

### Task 7: Implement Weekly Reflection digests

**Files:**
- Create: `app/api/synthesize/weekly/route.ts`

- [ ] **Step 1: Write the Weekly reflection generator endpoint**
  Extract past week messages and Honcho conclusions, call Gemini to generate a structured journal entry, and persist it in Supabase.

  ```typescript
  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';
  import { GoogleGenerativeAI } from '@google/generative-ai';
  import { getUserPeerCard } from '@/lib/honcho';
  import { embedText } from '@/lib/embeddings';

  export async function POST() {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const peerCard = await getUserPeerCard(user.id);

      // Fetch conversations from the past week
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { data: conversations } = await supabase
        .from('conversations')
        .select('messages, started_at')
        .eq('user_id', user.id)
        .gte('started_at', oneWeekAgo.toISOString());

      const conversationsText = conversations
        ?.map((c) => c.messages.map((m: any) => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`).join('\n'))
        .join('\n\n---\n\n') || 'No conversation logs this week.';

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({
        model: 'gemini-3-flash-preview',
        generationConfig: { responseMimeType: 'application/json' },
      });

      const prompt = `You are a warm, honest, non-sycophantic journaling companion.
Analyze the user's conversation history and their psychological Peer Card from the past week.
Synthesize a comprehensive structured weekly reflection entry. Return ONLY valid JSON matching this schema:

{
  "emotions": [{ "label": string, "intensity": float 0-1 }],
  "decisions": [{ "action": string, "considered": string }],
  "patterns": [{ "theme": string, "note": string }],
  "open_questions": [string],
  "key_context": [{ "entity": string, "role": string }],
  "summary": string
}

[PEER SNAPSHOT (HONCHO MEMORY)]
${peerCard}

[CONVERSATIONS THIS WEEK]
${conversationsText}

Only extract authentic details. In "summary", write a warm 3-4 sentence digest of their week, highlighting self-reflection.`;

      const response = await model.generateContent(prompt);
      const data = JSON.parse(response.response.text());

      // Generate embedding from weekly reflection summary
      const embeddingText = `Weekly Reflection Digest - ${data.summary} Emotions: ${data.emotions.map((e: any) => e.label).join(', ')}. Patterns: ${data.patterns.map((p: any) => p.theme).join(', ')}`;
      const embedding = await embedText(embeddingText);

      // Save to Supabase journal_entries
      const { data: savedEntry, error } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          created_at: new Date().toISOString(),
          emotions: data.emotions,
          decisions: data.decisions,
          patterns: data.patterns,
          open_questions: data.open_questions,
          key_context: data.key_context,
          embedding,
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ reflection: data.summary, entry: savedEntry });
    } catch (err) {
      console.error('[WEEKLY REFLECTION] API error:', err);
      return NextResponse.json({ error: 'Reflection generation failed' }, { status: 500 });
    }
  }
  ```

- [ ] **Step 2: Test API compilation**
  Run: `npx tsc --noEmit`
  Expected: Successful validation.

- [ ] **Step 3: Commit**
  ```bash
  git add app/api/synthesize/weekly/route.ts
  git commit -m "feat: implement weekly reflection digest generator and database persistence"
  ```
