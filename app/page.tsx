import { redirect } from 'next/navigation'

// Root redirects to /chat (middleware will send unauthenticated users to /auth)
export default function RootPage() {
  redirect('/chat')
}
