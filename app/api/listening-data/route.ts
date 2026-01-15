import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getTopArtists, getRecentTracks } from '@/lib/lastfm'
// Removed getArtistLocation import - we only use MusicBrainz database now

export async function GET() {
  try {
    const cookieStore = await cookies()
    const username = cookieStore.get('lastfm_username')

    if (!username) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    // Fetch user's top artists from different time periods and recent tracks
    // Reduced limits for faster initial load
    console.log(`Fetching data for user: ${username.value}`)
    
    let topArtistsOverall: any[] = []
    let recentTracks: any[] = []
    
    try {
      // Fetch ALL artists - use overall period to get everything, and fetch multiple pages
      const results = await Promise.allSettled([
        getTopArtists(username.value, 'overall', 1000), // Will paginate to get all
        getRecentTracks(username.value, 1000), // Get more recent tracks to catch any missing artists
      ])
      
      if (results[0].status === 'fulfilled') {
        topArtistsOverall = results[0].value
      } else {
        console.error('Error fetching overall artists:', results[0].reason)
      }
      
      if (results[1].status === 'fulfilled') {
        recentTracks = results[1].value
      } else {
        console.error('Error fetching recent tracks:', results[1].reason)
      }
    } catch (error) {
      console.error('Unexpected error fetching Last.fm data:', error)
      throw error
    }
    
    console.log(`Fetched: ${topArtistsOverall.length} overall artists, ${recentTracks.length} recent tracks`)
    
    // If we got no data at all, the user might not exist or have no listening history
    if (topArtistsOverall.length === 0 && recentTracks.length === 0) {
      return NextResponse.json(
        { 
          error: 'No listening data found. Make sure your Last.fm username is correct and you have scrobbled some tracks.',
          artists: [],
          total: 0,
          withLocation: 0,
        },
        { status: 404 }
      )
    }

    // Combine all artists and deduplicate
    const allArtists = new Map<string, {
      id: string
      name: string
      playcount: number
      genres: string[]
    }>()

    const addArtists = (artists: Array<{ name: string; playcount?: string }>) => {
      artists.forEach((artist) => {
        const playcount = parseInt(artist.playcount || '0', 10)
        if (!allArtists.has(artist.name)) {
          allArtists.set(artist.name, {
            id: artist.name.toLowerCase().replace(/\s+/g, '-'),
            name: artist.name,
            playcount,
            genres: [], // Last.fm doesn't provide genres in top artists endpoint
          })
        } else {
          // Update playcount if higher
          const existing = allArtists.get(artist.name)!
          if (playcount > existing.playcount) {
            existing.playcount = playcount
          }
        }
      })
    }

    addArtists(topArtistsOverall)

    // Add artists from recent tracks to catch any that might be missing
    recentTracks.forEach((track) => {
      if (!allArtists.has(track.artist)) {
        allArtists.set(track.artist, {
          id: track.artist.toLowerCase().replace(/\s+/g, '-'),
          name: track.artist,
          playcount: 0,
          genres: [],
        })
      }
    })

    // Sort artists by playcount (most played first) - no limit, get all artists
    const artistsArray = Array.from(allArtists.values())
      .sort((a, b) => (b.playcount || 0) - (a.playcount || 0))

    console.log(`Found ${artistsArray.length} total artists from Last.fm`)

    // Check MusicBrainz database for ALL artists - instant, no API calls!
    const { getLocationFromMusicBrainzDB } = require('@/lib/musicbrainzDB')
    const { saveLocationToDB } = require('@/lib/artistLocationDB')
    
    const artistsWithLocations = artistsArray.map((artist) => {
      // Check MusicBrainz database only
      const mbLocation = getLocationFromMusicBrainzDB(artist.name)
      
      if (mbLocation !== null && mbLocation !== undefined) {
        // Found in MusicBrainz DB - also save to JSON DB for consistency
        saveLocationToDB(artist.name, mbLocation)
        return {
          ...artist,
          location: mbLocation,
        }
      }
      
      // Not found in MusicBrainz database
      return {
        ...artist,
        location: undefined,
      }
    })
    
    const totalLocationsFound = artistsWithLocations.filter(a => a.location).length
    
    console.log(`Returning ${artistsArray.length} artists with ${totalLocationsFound} locations from MusicBrainz database`)
    
    return NextResponse.json({
      artists: artistsWithLocations,
      total: artistsArray.length,
      withLocation: totalLocationsFound,
      hasLocations: totalLocationsFound > 0,
    })
  } catch (error: any) {
    console.error('Error fetching listening data:', error)
    
    if (error.response?.status === 404 || error.message?.includes('not found')) {
      return NextResponse.json(
        { error: 'Last.fm username not found. Please log in again.' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { error: error.message || 'Failed to fetch listening data' },
      { status: 500 }
    )
  }
}
