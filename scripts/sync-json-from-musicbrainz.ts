/**
 * Sync JSON database with MusicBrainz database
 * This updates the JSON database with correct MusicBrainz data,
 * overwriting any incorrect geocoded data from before
 */

import { getAllLocations, saveLocationToDB } from '../lib/artistLocationDB'
import { getLocationFromMusicBrainzDB, getAllArtistsFromDB } from '../lib/musicbrainzDB'

async function syncJSONFromMusicBrainz() {
  console.log('Syncing JSON database with MusicBrainz database...\n')
  
  // Get all artists from MusicBrainz database
  const mbArtists = getAllArtistsFromDB()
  console.log(`Found ${mbArtists.length} artists in MusicBrainz database\n`)
  
  let updated = 0
  let skipped = 0
  
  for (let i = 0; i < mbArtists.length; i++) {
    const artistName = mbArtists[i]
    
    // Get location from MusicBrainz (with coordinates)
    const mbLocation = getLocationFromMusicBrainzDB(artistName)
    
    if (mbLocation && mbLocation.lat && mbLocation.lng) {
      // Update JSON database with MusicBrainz data
      saveLocationToDB(artistName, mbLocation)
      updated++
      
      if ((i + 1) % 10000 === 0) {
        console.log(`Progress: ${i + 1}/${mbArtists.length} (${updated} updated, ${skipped} skipped)`)
      }
    } else {
      skipped++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Sync Complete!')
  console.log('='.repeat(60))
  console.log(`Total artists in MusicBrainz: ${mbArtists.length}`)
  console.log(`Updated in JSON database: ${updated}`)
  console.log(`Skipped (no coordinates): ${skipped}`)
  console.log('='.repeat(60))
}

if (require.main === module) {
  syncJSONFromMusicBrainz().catch(console.error)
}

