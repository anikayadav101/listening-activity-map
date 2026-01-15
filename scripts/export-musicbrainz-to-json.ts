/**
 * Export MusicBrainz database to JSON for client-side use in GitHub Pages
 */

import { getAllArtistsFromDB } from '../lib/musicbrainzDB'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_DIR = path.join(process.cwd(), 'data', 'musicbrainz')
const DB_PATH = path.join(DB_DIR, 'artists.db')
const OUTPUT_PATH = path.join(process.cwd(), 'public', 'musicbrainz-locations.json')

async function exportToJSON() {
  console.log('Exporting MusicBrainz database to JSON...\n')
  
  if (!fs.existsSync(DB_PATH)) {
    console.error('Database not found at:', DB_PATH)
    process.exit(1)
  }
  
  const db = new Database(DB_PATH)
  
  // Get all artists with locations
  const rows = db.prepare(`
    SELECT name, normalized_name, lat, lng, city, country, area_name, begin_area_name, country_code
    FROM artists
    WHERE lat IS NOT NULL AND lng IS NOT NULL
  `).all() as any[]
  
  console.log(`Found ${rows.length} artists with locations`)
  
  // Create a lookup map by normalized name
  const locationMap: Record<string, {
    lat: number
    lng: number
    city?: string
    country?: string
  }> = {}
  
  for (const row of rows) {
    const normalizedName = row.normalized_name
    
    // Determine city and country
    let city: string | undefined = undefined
    let country: string | undefined = undefined
    
    const knownCountries = new Set([
      'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 
      'Italy', 'Spain', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 
      'Brazil', 'Mexico', 'Argentina', 'India', 'China', 'South Korea', 'Russia'
    ])
    
    city = row.city || row.begin_area_name || undefined
    country = row.country || row.area_name || row.country_code || undefined
    
    // Fix duplicate city/country issue
    if (city && country && city === country && !knownCountries.has(city)) {
      country = row.country_code ? 
        ({ 'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada' }[row.country_code] || row.country_code) :
        undefined
    }
    
    // Special case for M.I.A.
    if (normalizedName === 'm.i.a.' || normalizedName === 'm.i.a') {
      city = 'London'
      country = 'United Kingdom'
    }
    
    locationMap[normalizedName] = {
      lat: row.lat,
      lng: row.lng,
      city,
      country,
    }
  }
  
  // Ensure public directory exists
  const publicDir = path.join(process.cwd(), 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }
  
  // Write to JSON file
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(locationMap, null, 2))
  
  const fileSizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2)
  console.log(`\n✓ Exported ${rows.length} locations to ${OUTPUT_PATH}`)
  console.log(`  File size: ${fileSizeMB} MB`)
  
  db.close()
}

if (require.main === module) {
  exportToJSON().catch(console.error)
}

