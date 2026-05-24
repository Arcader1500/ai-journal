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
