/**
 * Client-side Last.fm API calls (for static/GitHub Pages deployment)
 * Note: API key will be visible in browser - acceptable for Last.fm public API
 */

import axios from 'axios'

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/'
const LASTFM_API_KEY = 'fb8f2756191054a775ecbe9637a85737' // Public API key - safe to expose

export interface LastFmArtist {
  name: string
  playcount?: string
  mbid?: string
}

async function callLastFmApi(params: Record<string, string>) {
  const queryParams = new URLSearchParams({
    ...params,
    api_key: LASTFM_API_KEY,
    format: 'json',
  })

  try {
    const response = await axios.get(`${LASTFM_API_BASE}?${queryParams.toString()}`)
    
    if (response.data.error) {
      throw new Error(`Last.fm API error: ${response.data.message || response.data.error}`)
    }
    
    return response.data
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(`Last.fm API error: ${error.response.data.message || error.response.data.error}`)
    }
    throw error
  }
}

export async function getTopArtists(
  username: string,
  period: '7day' | '1month' | '3month' | '6month' | '12month' | 'overall' = 'overall',
  limit: number = 1000
): Promise<LastFmArtist[]> {
  const allArtists: LastFmArtist[] = []
  let page = 1
  const pageSize = Math.min(limit, 1000) // Last.fm max is 1000 per page

  while (allArtists.length < limit) {
    const data = await callLastFmApi({
      method: 'user.gettopartists',
      user: username,
      period,
      limit: pageSize.toString(),
      page: page.toString(),
    }) as any

    if (!data.topartists?.artist) {
      break
    }

    const artists = Array.isArray(data.topartists.artist)
      ? data.topartists.artist
      : [data.topartists.artist]

    allArtists.push(...artists)

    const totalPages = parseInt(data.topartists['@attr']?.totalPages || '1')
    if (page >= totalPages || allArtists.length >= limit) {
      break
    }

    page++
  }

  return allArtists.slice(0, limit)
}

export async function getRecentTracks(username: string, limit: number = 200): Promise<any[]> {
  const allTracks: any[] = []
  let page = 1
  const pageSize = 200

  while (allTracks.length < limit) {
    const data = await callLastFmApi({
      method: 'user.getrecenttracks',
      user: username,
      limit: pageSize.toString(),
      page: page.toString(),
    }) as any

    if (!data.recenttracks?.track) {
      break
    }

    const tracks = Array.isArray(data.recenttracks.track)
      ? data.recenttracks.track
      : [data.recenttracks.track]

    allTracks.push(...tracks)

    const totalPages = parseInt(data.recenttracks['@attr']?.totalPages || '1')
    if (page >= totalPages || allTracks.length >= limit) {
      break
    }

    page++
  }

  return allTracks.slice(0, limit)
}

export async function getUserInfo(username: string): Promise<{ exists: boolean; name?: string }> {
  try {
    await callLastFmApi({
      method: 'user.getinfo',
      user: username,
    })
    return { exists: true, name: username }
  } catch (error: any) {
    if (error.message?.includes('User not found') || error.message?.includes('404')) {
      return { exists: false }
    }
    throw error
  }
}

export async function getArtistInfo(artistName: string): Promise<{ location?: string; mbid?: string } | null> {
  try {
    const data = await callLastFmApi({
      method: 'artist.getinfo',
      artist: artistName,
    }) as any

    return {
      location: data.artist?.bio?.placeformed || data.artist?.bio?.content?.match(/formed in ([^<]+)/i)?.[1],
      mbid: data.artist?.mbid,
    }
  } catch (error) {
    return null
  }
}

