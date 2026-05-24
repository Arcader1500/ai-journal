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
        const res = await fetch('/api/insights/data');
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
        <div className="spinner" style={{ border: '2px solid rgba(255,255,255,0.1)', borderTop: '2px solid var(--accent)', borderRadius: '50%', width: '24px', height: '24px', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text-primary)', padding: '40px 16px', fontFamily: 'var(--font)' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✨</span> Reflective Insights
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Evolving trends & cognitive memory model</p>
          </div>
          <Link href="/chat" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 500, transition: 'all 0.2s ease', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
            ← Back to Chat
          </Link>
        </header>

        {/* SVG/CSS Emotion Intensity Trends */}
        <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', marginBottom: '28px', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📊</span> Mood Intensity Trends
          </h2>
          {entries.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '48px 16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              No structured entries found yet. Synthesize some sessions in Chat to start tracking emotional trends!
            </div>
          ) : (
            <div style={{ display: 'flex', height: '180px', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border)', gap: '12px' }}>
              {entries.map((entry, idx) => {
                const maxIntensity = entry.emotions.length > 0 ? Math.max(...entry.emotions.map((e) => e.intensity), 0) * 100 : 20;
                const dateLabel = new Date(entry.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const mainEmotion = entry.emotions.length > 0 ? entry.emotions[0].label : 'calm';
                return (
                  <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', maxWidth: '28px', height: `${maxIntensity}%`, background: 'linear-gradient(to top, var(--accent-glow), var(--accent))', borderRadius: '6px 6px 0 0', position: 'relative', minHeight: '6px', boxShadow: 'var(--shadow-accent)' }} title={`${mainEmotion}: ${Math.round(maxIntensity)}%`} />
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>{dateLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Peer Card / Cognitive Memory Model */}
        <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', marginBottom: '28px', boxShadow: 'var(--shadow-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🧠</span> Honcho Peer Card
            </h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-text)', border: '1px solid var(--accent)', padding: '3px 10px', borderRadius: '99px', background: 'var(--accent-glow)', fontWeight: 500 }}>Cognitive Model</span>
          </div>
          <div style={{ color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.65', background: 'var(--bg)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', whiteSpace: 'pre-wrap' }}>
            {peerCard ? peerCard : 'Your cognitive memory model is currently forming. Continue chatting with your companion to build high-level insights, goals, and behavioral patterns.'}
          </div>
        </section>

        {/* Longitudinal Hybrid Search */}
        <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', marginBottom: '28px', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔍</span> Longitudinal Memory Search
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>Query across all conversation logs and vector entries to discover longitudinal insights.</p>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="e.g. When did I last feel this burnt out about my workload?" style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', padding: '14px', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
            <button type="submit" disabled={searching} style={{ background: 'var(--accent)', color: 'white', padding: '14px 24px', borderRadius: 'var(--radius-md)', fontWeight: 600, transition: 'all 0.2s ease', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-dark)'} onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          {searchResults && (
            <div style={{ marginTop: '20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.7', borderLeft: '4px solid var(--accent)' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--accent-text)' }}>Search Summary Answer:</div>
              <p style={{ color: 'var(--text-primary)' }}>{searchResults}</p>
            </div>
          )}
        </section>

        {/* Weekly Reflection Digests */}
        <section style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px', boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📝</span> Weekly Reflection Digest
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>Consolidate this week's conversation logs and Honcho conclusions into a new structured, auto-synthesized journal entry saved directly to your diary database.</p>
          <button onClick={generateWeeklyReflection} disabled={reflecting} style={{ background: 'var(--accent)', color: 'white', padding: '14px 28px', borderRadius: 'var(--radius-md)', fontWeight: 600, transition: 'all 0.2s ease', cursor: 'pointer' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-dark)'} onMouseLeave={(e) => e.currentTarget.style.background = 'var(--accent)'}>
            {reflecting ? 'Synthesizing...' : 'Generate Weekly Reflection'}
          </button>
          {reflection && (
            <div style={{ marginTop: '20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.7', borderLeft: '4px solid var(--success)' }}>
              <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--success)' }}>✓ Weekly Reflection Saved to Supabase:</div>
              <p style={{ color: 'var(--text-secondary)' }}>{reflection}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
