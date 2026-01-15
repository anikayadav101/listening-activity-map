/**
 * Import MusicBrainz artist JSON files from extracted dump into SQLite database
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data', 'musicbrainz')
const DB_PATH = path.join(DB_DIR, 'artists.db')

// Try to find artist folder in common locations
function findArtistFolder(): string | null {
  // Check command line argument first
  const args = process.argv.slice(2)
  if (args.length > 0) {
    const customPath = path.resolve(args[0])
    if (fs.existsSync(customPath) && fs.statSync(customPath).isDirectory()) {
      return customPath
    }
    console.warn(`Warning: Specified path does not exist: ${customPath}`)
  }
  
  const possiblePaths = [
    path.join(process.cwd(), 'artist'),
    path.join(process.cwd(), 'artists'),
    path.join(process.cwd(), '..', 'artist'),
    path.join(process.cwd(), '..', 'artists'),
    path.join(process.cwd(), 'data', 'artist'),
    path.join(process.cwd(), 'data', 'artists'),
    // Also check parent directories more thoroughly
    ...Array.from({ length: 3 }, (_, i) => {
      const parent = path.join(process.cwd(), ...Array(i + 1).fill('..'), 'artist')
      return parent
    }),
  ]
  
  for (const folderPath of possiblePaths) {
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      return folderPath
    }
  }
  
  return null
}

interface MusicBrainzArtist {
  id?: string
  name?: string
  'sort-name'?: string
  area?: {
    id?: string
    name?: string
    'sort-name'?: string
    'iso-3166-1-codes'?: string[]
  }
  'begin-area'?: {
    id?: string
    name?: string
    'sort-name'?: string
  }
  'life-span'?: {
    begin?: string
    end?: string
    ended?: boolean
  }
  relations?: Array<{
    type?: string
    area?: {
      id?: string
      name?: string
      coordinates?: {
        latitude?: number
        longitude?: number
      }
    }
  }>
}

function extractLocationData(artist: MusicBrainzArtist): {
  mbid: string | null
  areaName: string | null
  beginAreaName: string | null
  countryCode: string | null
  lat: number | null
  lng: number | null
} {
  const mbid = artist.id || null
  const areaName = artist.area?.name || null
  const beginAreaName = artist['begin-area']?.name || null
  const countryCode = artist.area?.['iso-3166-1-codes']?.[0] || null
  
  // Try to get coordinates from relations (area relations might have coordinates)
  let lat: number | null = null
  let lng: number | null = null
  
  if (artist.relations) {
    for (const relation of artist.relations) {
      if (relation.area?.coordinates) {
        lat = relation.area.coordinates.latitude || null
        lng = relation.area.coordinates.longitude || null
        if (lat && lng) break
      }
    }
  }
  
  return {
    mbid,
    areaName,
    beginAreaName,
    countryCode,
    lat,
    lng,
  }
}

async function importArtistsFromJSON() {
  console.log('Looking for artist folder...\n')
  
  const artistFolder = findArtistFolder()
  
  if (!artistFolder) {
    console.error('ERROR: Could not find artist/ folder!')
    console.error('\nPlease ensure the artist/ folder is in one of these locations:')
    console.error('  - ./artist/')
    console.error('  - ./artists/')
    console.error('  - ../artist/')
    console.error('  - ./data/artist/')
    console.error('\nOr specify the path as an argument:')
    console.error('  npm run import-musicbrainz-json -- /path/to/artist')
    process.exit(1)
  }
  
  console.log(`Found artist folder at: ${artistFolder}\n`)
  
  // Get all JSON files
  const files = fs.readdirSync(artistFolder)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(artistFolder, f))
  
  console.log(`Found ${files.length} JSON files to process\n`)
  
  if (files.length === 0) {
    console.error('No JSON files found in artist folder!')
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
  
  let totalProcessed = 0
  let totalImported = 0
  let totalWithCoordinates = 0
  let totalWithAreaOnly = 0
  let errors = 0
  
  console.log('Starting import...\n')
  
  // Process files in batches
  const batchSize = 100
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize)
    const artistsToInsert: Array<{
      name: string
      normalizedName: string
      mbid: string | null
      areaName: string | null
      beginAreaName: string | null
      countryCode: string | null
      lat: number | null
      lng: number | null
    }> = []
    
    for (const filePath of batch) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        const data = JSON.parse(fileContent)
        
        // Handle both single artist objects and arrays
        const artists: MusicBrainzArtist[] = Array.isArray(data) ? data : [data]
        
        for (const artist of artists) {
          if (!artist.name) continue
          
          totalProcessed++
          
          const locationData = extractLocationData(artist)
          const normalizedName = artist.name.toLowerCase().trim()
          
          artistsToInsert.push({
            name: artist.name,
            normalizedName,
            ...locationData,
          })
          
          if (locationData.lat && locationData.lng) {
            totalWithCoordinates++
          } else if (locationData.areaName || locationData.beginAreaName) {
            totalWithAreaOnly++
          }
        }
      } catch (error: any) {
        errors++
        if (errors <= 10) {
          console.warn(`Error processing ${filePath}: ${error.message}`)
        }
      }
    }
    
    if (artistsToInsert.length > 0) {
      insertMany(artistsToInsert)
      totalImported += artistsToInsert.length
    }
    
    if ((i + batchSize) % 1000 === 0 || i + batchSize >= files.length) {
      console.log(`Progress: ${Math.min(i + batchSize, files.length)}/${files.length} files processed, ${totalImported} artists imported`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Import Complete!')
  console.log('='.repeat(60))
  console.log(`Total files processed: ${files.length}`)
  console.log(`Total artists processed: ${totalProcessed}`)
  console.log(`Total artists imported: ${totalImported}`)
  console.log(`Artists with coordinates: ${totalWithCoordinates}`)
  console.log(`Artists with area only: ${totalWithAreaOnly}`)
  console.log(`Errors: ${errors}`)
  console.log(`Database saved to: ${DB_PATH}`)
  console.log('='.repeat(60))
  
  db.close()
}

if (require.main === module) {
  importArtistsFromJSON().catch(console.error)
}

