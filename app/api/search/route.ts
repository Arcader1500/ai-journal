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

Answer in 3-5 sentences. Reference specific dates or insights when present. Be authentic. Do not mention system mechanics like "RAG context" or "Honcho". Talk as their warm thinking companion.`;

    const response = await model.generateContent(systemPrompt);
    const answer = response.response.text().trim();

    return NextResponse.json({ answer });
  } catch (err) {
    console.error('[SEARCH] API error:', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
