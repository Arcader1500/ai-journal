import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getUserPeerCard } from '@/lib/honcho';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch the latest Peer Card from Honcho
    const peerCard = await getUserPeerCard(user.id);
    
    // Fetch latest 3 emotions from Supabase to capture recent emotional tags
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

Write a natural, warm, conversational greeting of 2-3 sentences. Proactively ask a question that references their recent situation or overall state. Avoid bullet points, lists, or markdown formatting. Be humble and authentic. Do not say "Based on your Peer Card" or "I noticed in your files". Present yourself naturally as their thinking partner.`;

    const response = await model.generateContent(prompt);
    const greeting = response.response.text().trim();

    return NextResponse.json({ greeting });
  } catch (err) {
    console.error('[PROACTIVE GREETING] Error generating greeting:', err);
    return NextResponse.json({ greeting: 'Hi there. How are you feeling today?' });
  }
}
