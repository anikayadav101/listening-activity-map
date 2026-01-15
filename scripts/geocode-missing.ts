/**
 * Geocode artists that have area names but no coordinates in MusicBrainz database
 */

import { getArtistsWithoutCoordinates, getAreaNameFromMusicBrainzDB, saveLocationToMusicBrainzDB } from '../lib/musicbrainzDB'
import { getCoordinatesForArea } from '../lib/artistLocation'

async function geocodeWithRetry(areaName: string, maxRetries = 2): Promise<{ lat: number; lng: number } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const coordinates = await Promise.race([
        getCoordinatesForArea(areaName),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)) // 5 second timeout
      ])
      
      if (coordinates) {
        return coordinates
      }
      
      // If failed, wait a bit before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }
  
  return null
}

async function main() {
  console.log('Finding artists with area names but no coordinates...\n')
  
  const artistsWithoutCoords = getArtistsWithoutCoordinates()
  console.log(`Found ${artistsWithoutCoords.length} artists without coordinates\n`)
  
  // Filter to only those with area names
  const artistsWithAreaNames = artistsWithoutCoords.filter(name => {
    const areaName = getAreaNameFromMusicBrainzDB(name)
    return areaName !== null && areaName !== undefined
  })
  
  console.log(`${artistsWithAreaNames.length} artists have area names to geocode\n`)
  
  let geocoded = 0
  let failed = 0
  
  for (let i = 0; i < artistsWithAreaNames.length; i++) {
    const artistName = artistsWithAreaNames[i]
    const areaName = getAreaNameFromMusicBrainzDB(artistName)
    
    if (areaName) {
      process.stdout.write(`[${i + 1}/${artistsWithAreaNames.length}] Geocoding ${artistName} -> ${areaName}... `)
      
      const coordinates = await geocodeWithRetry(areaName)
      
      if (coordinates) {
        saveLocationToMusicBrainzDB(
          artistName,
          null,
          areaName,
          null,
          null,
          coordinates.lat,
          coordinates.lng,
          null,
          areaName
        )
        geocoded++
        console.log(`✓ (${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)})`)
      } else {
        failed++
        console.log(`✗ (failed)`)
      }
      
      // Delay to avoid overwhelming geocoding APIs
      if (i < artistsWithAreaNames.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    if ((i + 1) % 25 === 0) {
      console.log(`\nProgress: ${i + 1}/${artistsWithAreaNames.length} (${geocoded} geocoded, ${failed} failed)\n`)
    }
  }
  
  console.log(`\n\nComplete!`)
  console.log(`Geocoded: ${geocoded} artists`)
  console.log(`Failed: ${failed} artists`)
  console.log(`Success rate: ${((geocoded / artistsWithAreaNames.length) * 100).toFixed(1)}%`)
}

if (require.main === module) {
  main().catch(console.error)
}

