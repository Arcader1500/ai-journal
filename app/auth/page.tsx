'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    console.log('[auth] Sending magic link to:', email.trim())
    console.log('[auth] Redirect URL:', `${window.location.origin}/auth/callback`)
    console.log('[auth] Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)

    const { data, error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Ask Supabase to issue a long-lived session (default is already
        // 1 week; the middleware keeps it refreshed automatically).
        shouldCreateUser: true,
      },
    })

    console.log('[auth] signInWithOtp result:', { data, error })

    if (error) {
      console.error('[auth] Error:', error)
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
    // On success, browser redirects — no need to setLoading(false)
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">✦</div>
          <span className="auth-logo-name">AI Journal</span>
        </div>

        {/* Heading */}
        <h1 className="auth-heading">Your reflective space</h1>
        <p className="auth-subheading">
          An honest AI companion to help you think clearly, reflect deeply, and understand yourself better.
        </p>

        {/* Google OAuth */}
        <button
          id="google-login-btn"
          type="button"
          className="auth-btn-google"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
        >
          {googleLoading ? (
            <span className="spinner" />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* Divider */}
        <div className="auth-divider">
          <span>or sign in with email</span>
        </div>

        {/* Magic link form */}
        {!sent ? (
          <form onSubmit={handleMagicLink}>
            <label htmlFor="email-input" className="auth-label">
              Email address
            </label>
            <input
              id="email-input"
              type="email"
              className="auth-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading || googleLoading}
            />

            <button
              id="send-magic-link-btn"
              type="submit"
              className="auth-btn"
              disabled={loading || googleLoading}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="spinner" />
                  Sending…
                </span>
              ) : (
                'Send Magic Link'
              )}
            </button>

            {error && <p className="auth-error">{error}</p>}
          </form>
        ) : (
          <div className="auth-success">
            <strong>✓ Check your inbox.</strong>
            <br />
            We sent a magic link to <strong>{email}</strong>. Click it to sign in — no password needed.
          </div>
        )}
      </div>
    </main>
  )
}
