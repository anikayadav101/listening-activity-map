import { NextRequest, NextResponse } from 'next/server'
import { getUserInfo } from '@/lib/lastfm'

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Verify the username exists on Last.fm
    const userInfo = await getUserInfo(username.trim())

    if (!userInfo.exists) {
      return NextResponse.json(
        { error: 'Last.fm username not found. Please check your username and try again.' },
        { status: 404 }
      )
    }

    // Store username in cookie (simple approach, no sensitive data)
    const response = NextResponse.json({ success: true, username: username.trim() })
    response.cookies.set('lastfm_username', username.trim(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to verify username' },
      { status: 500 }
    )
  }
}
