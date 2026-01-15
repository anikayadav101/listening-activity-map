import { NextRequest, NextResponse } from 'next/server'
import { getLocationFromMusicBrainzDB } from '@/lib/musicbrainzDB'

interface LocationData {
  lat: number
  lng: number
  city?: string
  country?: string
}

/**
 * Background location fetching endpoint
 * Now only checks MusicBrainz database - no API calls needed!
 */
export async function POST(request: NextRequest) {
  try {
    const { artists, startIndex = 0, batchSize = 100 } = await request.json()
    
    if (!artists || !Array.isArray(artists)) {
      return NextResponse.json(
        { error: 'Artists array required' },
        { status: 400 }
      )
    }

    const artistsToProcess = artists.slice(startIndex, startIndex + batchSize)
    
    // Check MusicBrainz database for all artists (instant - no API calls!)
    const results: Array<{ name: string; location: LocationData | null }> = []
    
    artistsToProcess.forEach((artist: { name: string }) => {
      const location = getLocationFromMusicBrainzDB(artist.name)
      results.push({
        name: artist.name,
        location: location || null,
      })
    })
    
    const locationsFound = results.filter(r => r.location && typeof r.location === 'object' && 'lat' in r.location).length
    console.log(`Batch complete: ${locationsFound} locations found out of ${results.length} artists`)

    return NextResponse.json({
      locations: results,
      processed: results.length,
      nextIndex: startIndex + batchSize,
      hasMore: startIndex + batchSize < artists.length,
    })
  } catch (error: any) {
    console.error('Error fetching locations:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch locations' },
      { status: 500 }
    )
  }
}
