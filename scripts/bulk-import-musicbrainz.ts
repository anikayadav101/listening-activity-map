/**
 * Bulk import artist locations from MusicBrainz API into local SQLite database
 * This script processes all your artists and fetches their locations from MusicBrainz
 */

import axios from 'axios'
import { saveLocationToMusicBrainzDB, getArtistsWithoutCoordinates } from '../lib/musicbrainzDB'
import { getAllLocations } from '../lib/artistLocationDB'
import { getCoordinatesForArea } from '../lib/artistLocation'

// Rate limiting for MusicBrainz (1 request per second)
let lastRequest = 0
const RATE_LIMIT = 1000

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function rateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequest
  if (timeSinceLastRequest < RATE_LIMIT) {
    await sleep(RATE_LIMIT - timeSinceLastRequest)
  }
  lastRequest = Date.now()
}

async function fetchArtistFromMB(artistName: string) {
  await rateLimit()
  
  try {
    const response = await axios.get('https://musicbrainz.org/ws/2/artist/', {
      params: {
        query: `artist:"${artistName}"`,
        limit: 3,
        fmt: 'json',
      },
      headers: {
        'User-Agent': 'ListeningMap/1.0.0 (https://github.com/yourusername/listening-map)',
      },
      timeout: 5000,
    })
    
    return response.data
  } catch (error: any) {
    if (error.response?.status === 429) {
      // Rate limited - wait longer
      await sleep(2000)
      return null
    }
    return null
  }
}

async function getArtistDetails(mbid: string) {
  await rateLimit()
  
  try {
    const response = await axios.get(`https://musicbrainz.org/ws/2/artist/${mbid}`, {
      params: {
        inc: 'area-rels',
        fmt: 'json',
      },
      headers: {
        'User-Agent': 'ListeningMap/1.0.0 (https://github.com/yourusername/listening-map)',
      },
      timeout: 5000,
    })
    
    return response.data
  } catch (error: any) {
    if (error.response?.status === 429) {
      await sleep(2000)
      return null
    }
    return null
  }
}

async function processArtist(artistName: string): Promise<boolean> {
  try {
    const searchResult = await fetchArtistFromMB(artistName)
    
    if (!searchResult?.artists || searchResult.artists.length === 0) {
      return false
    }
    
    // Try each search result
    for (const artist of searchResult.artists) {
      const details = await getArtistDetails(artist.id)
      
      if (!details) continue
      
      const beginArea = details['begin-area']
      const area = details.area
      const countryCode = details.country
      
      const locationArea = beginArea || area
      
      if (locationArea?.name) {
        // Try to get coordinates
        const coordinates = await getCoordinatesForArea(locationArea.name)
        
        saveLocationToMusicBrainzDB(
          artistName,
          artist.id,
          area?.name || null,
          beginArea?.name || null,
          countryCode || null,
          coordinates?.lat || null,
          coordinates?.lng || null,
          beginArea?.name || null,
          area?.name || countryCode || null
        )
        
        if (coordinates) {
          console.log(`✓ ${artistName} -> ${locationArea.name} (${coordinates.lat}, ${coordinates.lng})`)
          return true
        } else {
          console.log(`⚠ ${artistName} -> ${locationArea.name} (no coordinates)`)
          return true
        }
      }
    }
    
    return false
  } catch (error: any) {
    console.error(`Error processing ${artistName}:`, error.message)
    return false
  }
}

async function main() {
  console.log('Starting bulk import from MusicBrainz...\n')
  
  // Get all artists from existing database
  const allLocations = getAllLocations()
  const allArtists = Object.keys(allLocations)
  
  console.log(`Found ${allArtists.length} artists in database`)
  
  // Filter to artists without locations
  const artistsNeedingLocations = allArtists.filter(name => !allLocations[name])
  
  console.log(`${artistsNeedingLocations.length} artists need locations\n`)
  
  if (artistsNeedingLocations.length === 0) {
    console.log('All artists already have locations!')
    return
  }
  
  console.log(`This will take approximately ${Math.ceil(artistsNeedingLocations.length * 2 / 60)} minutes`)
  console.log('(MusicBrainz rate limit: 1 request/second, ~2 requests per artist)\n')
  console.log('Starting import...\n')
  
  let found = 0
  let notFound = 0
  
  for (let i = 0; i < artistsNeedingLocations.length; i++) {
    const artistName = artistsNeedingLocations[i]
    const success = await processArtist(artistName)
    
    if (success) {
      found++
    } else {
      notFound++
    }
    
    if ((i + 1) % 10 === 0) {
      console.log(`\nProgress: ${i + 1}/${artistsNeedingLocations.length} (${found} found, ${notFound} not found)\n`)
    }
  }
  
  console.log(`\n\nComplete!`)
  console.log(`Found locations for: ${found} artists`)
  console.log(`Not found: ${notFound} artists`)
  console.log(`\nDatabase saved to: data/musicbrainz/artists.db`)
}

if (require.main === module) {
  main().catch(console.error)
}

export { processArtist }

