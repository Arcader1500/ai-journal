import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the conversation first to verify ownership and synthesized status
    const { data: conversation, error: fetchError } = await supabase
      .from('conversations')
      .select('id, synthesized')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Synthesized conversations have an associated journal entry — disallow
    // deletion at the API level so the entry is never orphaned.
    if (conversation.synthesized) {
      return NextResponse.json(
        { error: 'Cannot delete a synthesized conversation' },
        { status: 409 }
      )
    }

    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete conversation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
