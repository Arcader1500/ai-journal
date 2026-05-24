import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserPeerCard } from '@/lib/honcho';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch user Peer Card from Honcho
    const peerCard = await getUserPeerCard(user.id);

    // Fetch emotions from the last 7 entries to feed the trend chart
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('created_at, emotions')
      .order('created_at', { ascending: false })
      .limit(7);

    return NextResponse.json({ entries: entries || [], peerCard });
  } catch (e) {
    console.error('[INSIGHTS DATA] Failed to fetch:', e);
    return NextResponse.json({ error: 'Failed to load insights data' }, { status: 500 });
  }
}
