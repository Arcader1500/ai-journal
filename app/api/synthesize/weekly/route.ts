// Weekly reflection digest generator API endpoint
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

Only extract authentic details. In "summary", write a warm 3-4 sentence digest of their week, highlighting self-reflection. Do not include markdown formatting or outer quotes, just pure valid JSON.`;

    const response = await model.generateContent(prompt);
    const data = JSON.parse(response.response.text());

    // Generate embedding from weekly reflection summary for RAG retrieval
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
