/**
 * Import MusicBrainz artist and place JSONL dumps into SQLite database
 * This script processes the extracted artist.tar.xz and place.tar.xz files
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import readline from 'readline'

const DB_DIR = path.join(process.cwd(), 'data', 'musicbrainz')
const DB_PATH = path.join(DB_DIR, 'artists.db')

// Default paths - can be overridden with command line arguments
const DEFAULT_ARTIST_PATH = path.join(process.env.HOME || '', 'Downloads', 'artist', 'artist')
const DEFAULT_PLACE_PATH = path.join(process.env.HOME || '', 'Downloads', 'place', 'mbdump', 'place')

interface AreaCoordinates {
  lat: number
  lng: number
  name: string
}

interface MusicBrainzArtist {
  id?: string
  name?: string
  area?: {
    id?: string
    name?: string
    'iso-3166-1-codes'?: string[]
  }
  'begin-area'?: {
    id?: string
    name?: string
  }
  'end-area'?: {
    id?: string
    name?: string
  }
}

interface MusicBrainzPlace {
  id?: string
  name?: string
  coordinates?: {
    latitude?: number
    longitude?: number
  }
  area?: {
    id?: string
    name?: string
  }
}

// Build area ID to coordinates lookup from place file
async function buildAreaCoordinatesMap(placeFilePath: string): Promise<Map<string, AreaCoordinates>> {
  console.log(`\nBuilding area coordinates lookup from place file...`)
  console.log(`Reading: ${placeFilePath}\n`)
  
  if (!fs.existsSync(placeFilePath)) {
    console.warn(`Warning: Place file not found at ${placeFilePath}`)
    return new Map()
  }
  
  const areaMap = new Map<string, AreaCoordinates>()
  const fileStream = fs.createReadStream(placeFilePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })
  
  let lineCount = 0
  let placesWithCoords = 0
  
  for await (const line of rl) {
    if (!line.trim()) continue
    
    try {
      const place: MusicBrainzPlace = JSON.parse(line)
      
      if (place.coordinates?.latitude && place.coordinates?.longitude && place.area?.id) {
        const areaId = place.area.id
        const existing = areaMap.get(areaId)
        
        // Prefer places with area names, or keep first coordinate
        if (!existing || place.area.name) {
          areaMap.set(areaId, {
            lat: place.coordinates.latitude,
            lng: place.coordinates.longitude,
            name: place.area.name || existing?.name || '',
          })
          placesWithCoords++
        }
      }
      
      lineCount++
      if (lineCount % 100000 === 0) {
        console.log(`  Processed ${lineCount} places, found ${placesWithCoords} with coordinates`)
      }
    } catch (error) {
      // Skip invalid JSON lines
    }
  }
  
  console.log(`\n✓ Built area coordinates map: ${areaMap.size} areas with coordinates`)
  return areaMap
}

// Import artists from JSONL file
async function importArtists(artistFilePath: string, areaMap: Map<string, AreaCoordinates>) {
  console.log(`\nImporting artists from artist file...`)
  console.log(`Reading: ${artistFilePath}\n`)
  
  if (!fs.existsSync(artistFilePath)) {
    console.error(`ERROR: Artist file not found at ${artistFilePath}`)
    process.exit(1)
  }
  
  // Initialize database
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }
  
  const db = new Database(DB_PATH)
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      mbid TEXT,
      area_name TEXT,
      begin_area_name TEXT,
      country_code TEXT,
      lat REAL,
      lng REAL,
      city TEXT,
      country TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_normalized_name ON artists(normalized_name);
    CREATE INDEX IF NOT EXISTS idx_mbid ON artists(mbid);
  `)
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO artists 
    (name, normalized_name, mbid, area_name, begin_area_name, country_code, lat, lng, city, country, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)
  
  const insertMany = db.transaction((artists: Array<{
    name: string
    normalizedName: string
    mbid: string | null
    areaName: string | null
    beginAreaName: string | null
    countryCode: string | null
    lat: number | null
    lng: number | null
  }>) => {
    for (const artist of artists) {
      insertStmt.run(
        artist.name,
        artist.normalizedName,
        artist.mbid,
        artist.areaName,
        artist.beginAreaName,
        artist.countryCode,
        artist.lat,
        artist.lng,
        artist.beginAreaName || null, // city
        artist.areaName || artist.countryCode || null, // country
      )
    }
  })
  
  const fileStream = fs.createReadStream(artistFilePath)
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  })
  
  let totalProcessed = 0
  let totalImported = 0
  let totalWithCoordinates = 0
  let totalWithAreaOnly = 0
  let errors = 0
  
  const batch: Array<{
    name: string
    normalizedName: string
    mbid: string | null
    areaName: string | null
    beginAreaName: string | null
    countryCode: string | null
    lat: number | null
    lng: number | null
  }> = []
  
  const BATCH_SIZE = 1000
  
  for await (const line of rl) {
    if (!line.trim()) continue
    
    try {
      const artist: MusicBrainzArtist = JSON.parse(line)
      
      if (!artist.name || !artist.id) continue
      
      totalProcessed++
      
      const normalizedName = artist.name.toLowerCase().trim()
      const mbid = artist.id
      const areaName = artist.area?.name || null
      const beginAreaName = artist['begin-area']?.name || null
      const countryCode = artist.area?.['iso-3166-1-codes']?.[0] || null
      
      // Try to get coordinates from area map
      let lat: number | null = null
      let lng: number | null = null
      
      // First try begin-area (usually more specific, like a city)
      if (artist['begin-area']?.id) {
        const coords = areaMap.get(artist['begin-area'].id)
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
      }
      
      // If no begin-area coordinates, try area (usually country/region)
      if (!lat && !lng && artist.area?.id) {
        const coords = areaMap.get(artist.area.id)
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
      }
      
      batch.push({
        name: artist.name,
        normalizedName,
        mbid,
        areaName,
        beginAreaName,
        countryCode,
        lat,
        lng,
      })
      
      if (lat && lng) {
        totalWithCoordinates++
      } else if (areaName || beginAreaName) {
        totalWithAreaOnly++
      }
      
      // Insert in batches
      if (batch.length >= BATCH_SIZE) {
        insertMany(batch)
        totalImported += batch.length
        batch.length = 0
        
        if (totalImported % 10000 === 0) {
          console.log(`  Processed ${totalProcessed} artists, imported ${totalImported} (${totalWithCoordinates} with coordinates)`)
        }
      }
    } catch (error: any) {
      errors++
      if (errors <= 10) {
        console.warn(`  Error processing line: ${error.message}`)
      }
    }
  }
  
  // Insert remaining batch
  if (batch.length > 0) {
    insertMany(batch)
    totalImported += batch.length
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Import Complete!')
  console.log('='.repeat(60))
  console.log(`Total artists processed: ${totalProcessed}`)
  console.log(`Total artists imported: ${totalImported}`)
  console.log(`Artists with coordinates: ${totalWithCoordinates}`)
  console.log(`Artists with area only: ${totalWithAreaOnly}`)
  console.log(`Errors: ${errors}`)
  console.log(`Database saved to: ${DB_PATH}`)
  console.log('='.repeat(60))
  
  db.close()
}

async function main() {
  const args = process.argv.slice(2)
  
  const artistPath = args[0] || DEFAULT_ARTIST_PATH
  const placePath = args[1] || DEFAULT_PLACE_PATH
  
  console.log('MusicBrainz Dump Importer')
  console.log('='.repeat(60))
  console.log(`Artist file: ${artistPath}`)
  console.log(`Place file: ${placePath}`)
  
  // Step 1: Build area coordinates map from place file
  const areaMap = await buildAreaCoordinatesMap(placePath)
  
  // Step 2: Import artists with coordinates
  await importArtists(artistPath, areaMap)
}

if (require.main === module) {
  main().catch(console.error)
}

