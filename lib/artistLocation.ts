/**
 * Simplified artist location lookup - uses only MusicBrainz local database
 */

import { getLocationFromMusicBrainzDB } from './musicbrainzDB'
import { saveLocationToDB } from './artistLocationDB'

export interface LocationData {
  lat: number
  lng: number
  city?: string
  country?: string
}

// In-memory cache for current session
const locationCache = new Map<string, LocationData | null>()

/**
 * Get artist location from MusicBrainz database only
 * This is instant - no API calls needed!
 */
export async function getArtistLocation(
  artistName: string
): Promise<LocationData | null> {
  // Check in-memory cache first (fastest)
  if (locationCache.has(artistName)) {
    return locationCache.get(artistName) || null
  }

  // Check MusicBrainz local database (our only source)
  const mbDbLocation = getLocationFromMusicBrainzDB(artistName)
  
  if (mbDbLocation !== null && mbDbLocation !== undefined) {
    // Found in MusicBrainz DB with coordinates - instant!
    locationCache.set(artistName, mbDbLocation)
    // Also save to JSON DB for consistency (optional, for backwards compatibility)
    saveLocationToDB(artistName, mbDbLocation)
    return mbDbLocation
  }
  
  // Not found in MusicBrainz database
  locationCache.set(artistName, null)
  return null
}
