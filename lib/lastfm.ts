import axios from 'axios'

const LASTFM_API_BASE = 'https://ws.audioscrobbler.com/2.0/'

export interface LastFmArtist {
  name: string
  playcount: string
  mbid?: string
  url: string
  image?: Array<{ '#text': string; size: string }>
}

export interface LastFmTopArtistsResponse {
  topartists: {
    artist: LastFmArtist[]
    '@attr': {
      page: string
      perPage: string
      totalPages: string
      total: string
    }
  }
}

export interface LastFmRecentTracksResponse {
  recenttracks: {
    track: Array<{
      artist: { '#text': string; mbid?: string }
      name: string
      date?: { '#text': string }
      mbid?: string
    }>
    '@attr': {
      page: string
      perPage: string
      totalPages: string
      total: string
      user: string
    }
  }
}

async function callLastFmApi(params: Record<string, string>) {
  const apiKey = process.env.LASTFM_API_KEY
  if (!apiKey) {
    throw new Error('LASTFM_API_KEY is not set')
  }

  const queryParams = new URLSearchParams({
    ...params,
    api_key: apiKey,
    format: 'json',
  })

  try {
    const response = await axios.get(`${LASTFM_API_BASE}?${queryParams.toString()}`)
    
    // Check for Last.fm API errors
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
  try {
    const allArtists: LastFmArtist[] = []
    let page = 1
    let totalPages = 1
    
    // Fetch all pages to get all artists
    do {
      const data = await callLastFmApi({
        method: 'user.gettopartists',
        user: username,
        period,
        limit: '1000', // Max per page
        page: page.toString(),
      }) as LastFmTopArtistsResponse

      const artists = data.topartists?.artist
      if (artists) {
        // Handle both array and single object cases
        const artistArray = Array.isArray(artists) ? artists : [artists]
        allArtists.push(...artistArray)
      }
      
      totalPages = parseInt(data.topartists?.['@attr']?.totalPages || '1', 10)
      page++
      
      // Minimal delay - Last.fm is usually fast
      if (page <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } while (page <= totalPages)
    
    return allArtists
  } catch (error: any) {
    console.error('Error fetching top artists from Last.fm:', error)
    // If it's a "user not found" error, return empty array instead of throwing
    if (error.message?.includes('User not found') || error.message?.includes('error code 6')) {
      return []
    }
    throw error
  }
}

export async function getRecentTracks(
  username: string,
  limit: number = 200
): Promise<Array<{ artist: string; mbid?: string }>> {
  try {
    const data = await callLastFmApi({
      method: 'user.getrecenttracks',
      user: username,
      limit: limit.toString(),
    }) as LastFmRecentTracksResponse

    if (!data.recenttracks?.track) {
      return []
    }

    // Extract unique artists from recent tracks
    const artistMap = new Map<string, { artist: string; mbid?: string }>()
    
    data.recenttracks.track.forEach((track) => {
      const artistName = track.artist['#text'] || track.artist as any
      if (artistName && !artistMap.has(artistName)) {
        artistMap.set(artistName, {
          artist: artistName,
          mbid: track.artist.mbid || track.mbid,
        })
      }
    })

    return Array.from(artistMap.values())
  } catch (error) {
    console.error('Error fetching recent tracks from Last.fm:', error)
    throw error
  }
}

export async function getUserInfo(username: string): Promise<{ exists: boolean; name?: string }> {
  try {
    await callLastFmApi({
      method: 'user.getinfo',
      user: username,
    })
    return { exists: true, name: username }
  } catch (error: any) {
    if (error.response?.status === 404 || error.response?.data?.error === 6) {
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
    
    if (data.artist) {
      return {
        location: data.artist.formed || data.artist.bio?.content?.match(/Formed in (.+?)[\.\n]/)?.[1],
        mbid: data.artist.mbid,
      }
    }
    return null
  } catch (error) {
    return null
  }
}

