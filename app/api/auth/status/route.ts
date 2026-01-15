import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const cookieStore = await cookies()
  const username = cookieStore.get('lastfm_username')
  
  return NextResponse.json({
    authenticated: !!username,
    username: username?.value || null,
  })
}
