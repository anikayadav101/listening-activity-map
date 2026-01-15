import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

interface ArtistLocation {
  name: string
  normalized_name: string
  mbid?: string
  area_name?: string
  begin_area_name?: string
  country_code?: string
  lat?: number
  lng?: number
  city?: string
  country?: string
}

const DB_DIR = path.join(process.cwd(), 'data', 'musicbrainz')
const DB_PATH = path.join(DB_DIR, 'artists.db')

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true })
}

let db: Database.Database | null = null

function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    
    // Create table if it doesn't exist
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
    `)
  }
  
  return db
}

export function getLocationFromMusicBrainzDB(artistName: string): { lat: number; lng: number; city?: string; country?: string } | null {
  const database = getDatabase()
  const normalizedName = artistName.toLowerCase().trim()
  
  // Special cases for artists with known incorrect data in MusicBrainz
  const specialCases: Record<string, { lat: number; lng: number; city?: string; country?: string }> = {
    'm.i.a.': { lat: 51.5074, lng: -0.1278, city: 'London', country: 'United Kingdom' },
    'm.i.a': { lat: 51.5074, lng: -0.1278, city: 'London', country: 'United Kingdom' },
  }
  
  if (specialCases[normalizedName]) {
    return specialCases[normalizedName]
  }
  
  const row = database.prepare(`
    SELECT area_name, begin_area_name, country_code, lat, lng, city, country
    FROM artists
    WHERE normalized_name = ?
  `).get(normalizedName) as any
  
  if (row) {
    // If we have coordinates, return them
    if (row.lat && row.lng) {
      // Determine city and country more intelligently
      let city: string | undefined = undefined
      let country: string | undefined = undefined
      
      // Known country names to help distinguish cities from countries
      const knownCountries = new Set([
        'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 
        'Italy', 'Spain', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 
        'Brazil', 'Mexico', 'Argentina', 'India', 'China', 'South Korea', 'Russia', 'Belgium',
        'Switzerland', 'Austria', 'Portugal', 'Greece', 'Ireland', 'New Zealand', 'South Africa',
        'Turkey', 'Indonesia', 'Thailand', 'Vietnam', 'Philippines', 'Chile', 'Colombia', 'Peru'
      ])
      
      // Priority 1: Use stored city/country if they make sense
      // BUT: if city and country are the same, they're likely both wrong
      if (row.city && row.country && row.city !== row.country && !knownCountries.has(row.city) && knownCountries.has(row.country)) {
        // Stored values are correct
        city = row.city
        country = row.country
      } else if (row.begin_area_name && row.area_name) {
        // We have both begin_area (city) and area (country/region)
        city = row.begin_area_name
        // Check if area_name is a known country, otherwise might be a region
        if (knownCountries.has(row.area_name)) {
          country = row.area_name
        } else {
          // area_name might be a region/state, use country_code if available
          country = row.country_code || row.area_name
        }
      } else if (row.begin_area_name) {
        // Only have begin_area (city)
        city = row.begin_area_name
        country = row.country || row.area_name || row.country_code || undefined
      } else if (row.area_name) {
        // Only have area_name - need to determine if it's a city or country
        if (knownCountries.has(row.area_name)) {
          // It's a country
          country = row.area_name
          city = row.city || row.begin_area_name || undefined
        } else {
          // Likely a city - use area_name as city
          city = row.area_name
          // Try to get country from stored country, country_code, or area_name if it's a known country
          if (row.country && knownCountries.has(row.country) && row.country !== row.area_name) {
            country = row.country
          } else if (row.country_code) {
            // Will be mapped later
            country = row.country_code
          } else {
            country = undefined
          }
        }
      } else {
        // Fallback to stored values
        city = row.city || row.begin_area_name || undefined
        country = row.country || row.country_code || undefined
      }
      
      // Special case: if country is stored as what looks like a city name, swap them
      if (country && !knownCountries.has(country) && city && knownCountries.has(city)) {
        // Values are swapped
        const temp = city
        city = country
        country = temp
      }
      
      // If country looks like a city name (not in known countries), it's probably the city
      if (country && !knownCountries.has(country) && !city) {
        // Country field actually contains a city name
        city = country
        country = undefined
      }
      
      // CRITICAL FIX: If city and country are the same (and not a known country), fix it
      if (city && country && city === country && !knownCountries.has(city)) {
        // Both are set to the same city name - use city_code to get proper country
        city = city // Keep the city
        country = undefined // Clear the incorrect country
      }
      
      // If we have a country_code but no country name, try to map it
      if (row.country_code && !country) {
        const countryCodeMap: Record<string, string> = {
          'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada', 'AU': 'Australia',
          'DE': 'Germany', 'FR': 'France', 'JP': 'Japan', 'IT': 'Italy', 'ES': 'Spain',
          'NL': 'Netherlands', 'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland',
          'PL': 'Poland', 'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina', 'IN': 'India',
          'CN': 'China', 'KR': 'South Korea', 'RU': 'Russia', 'IE': 'Ireland', 'NZ': 'New Zealand',
          'ZA': 'South Africa', 'TR': 'Turkey', 'ID': 'Indonesia', 'TH': 'Thailand', 'VN': 'Vietnam',
          'PH': 'Philippines', 'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru'
        }
        country = countryCodeMap[row.country_code] || row.country_code
      }
      
      // Try to infer country from coordinates if we have city but no country
      if (city && !country && row.lat && row.lng) {
        // US cities are typically between these coordinates
        if (row.lat >= 24.396308 && row.lat <= 49.384358 && row.lng >= -125.0 && row.lng <= -66.93457) {
          country = 'United States'
        }
        // UK coordinates
        else if (row.lat >= 49.8 && row.lat <= 60.9 && row.lng >= -8.2 && row.lng <= 1.8) {
          country = 'United Kingdom'
        }
        // Canada coordinates
        else if (row.lat >= 41.7 && row.lat <= 83.1 && row.lng >= -141.0 && row.lng <= -52.6) {
          country = 'Canada'
        }
        // Add more coordinate-based inference if needed
      }
      
      // Final check: if city and country are still the same, use country_code to fix it
      if (city && country && city === country && row.country_code) {
        const countryCodeMap: Record<string, string> = {
          'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada', 'AU': 'Australia',
          'DE': 'Germany', 'FR': 'France', 'JP': 'Japan', 'IT': 'Italy', 'ES': 'Spain',
          'NL': 'Netherlands', 'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland',
          'PL': 'Poland', 'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina', 'IN': 'India',
          'CN': 'China', 'KR': 'South Korea', 'RU': 'Russia', 'IE': 'Ireland', 'NZ': 'New Zealand',
          'ZA': 'South Africa', 'TR': 'Turkey', 'ID': 'Indonesia', 'TH': 'Thailand', 'VN': 'Vietnam',
          'PH': 'Philippines', 'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru'
        }
        const mappedCountry = countryCodeMap[row.country_code]
        if (mappedCountry) {
          country = mappedCountry
        } else {
          // If country_code doesn't map, and city/country are same, clear country and use code
          country = row.country_code
        }
      }
      
      // Last resort: if city and country are identical and not a known country, clear country
      if (city && country && city === country && !knownCountries.has(city)) {
        country = undefined
        // Try to use country_code if available
        if (row.country_code) {
          const countryCodeMap: Record<string, string> = {
            'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada', 'AU': 'Australia',
            'DE': 'Germany', 'FR': 'France', 'JP': 'Japan', 'IT': 'Italy', 'ES': 'Spain',
            'NL': 'Netherlands', 'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland',
            'PL': 'Poland', 'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina', 'IN': 'India',
            'CN': 'China', 'KR': 'South Korea', 'RU': 'Russia', 'IE': 'Ireland', 'NZ': 'New Zealand',
            'ZA': 'South Africa', 'TR': 'Turkey', 'ID': 'Indonesia', 'TH': 'Thailand', 'VN': 'Vietnam',
            'PH': 'Philippines', 'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru'
          }
          country = countryCodeMap[row.country_code] || undefined
        }
      }
      
      return {
        lat: row.lat,
        lng: row.lng,
        city,
        country,
      }
    }
    
    // If we have area name but no coordinates, return the area info
    // The caller can try to geocode it
    if (row.area_name || row.begin_area_name) {
      // Return null but we know the area exists - caller should try geocoding
      return null
    }
  }
  
  return null
}

export function getAreaNameFromMusicBrainzDB(artistName: string): string | null {
  const database = getDatabase()
  const normalizedName = artistName.toLowerCase().trim()
  
  const row = database.prepare(`
    SELECT area_name, begin_area_name, country_code
    FROM artists
    WHERE normalized_name = ?
  `).get(normalizedName) as any
  
  if (row) {
    return row.begin_area_name || row.area_name || row.country_code || null
  }
  
  return null
}

export function saveLocationToMusicBrainzDB(
  artistName: string,
  mbid: string | null,
  areaName: string | null,
  beginAreaName: string | null,
  countryCode: string | null,
  lat: number | null,
  lng: number | null,
  city: string | null,
  country: string | null
) {
  const database = getDatabase()
  const normalizedName = artistName.toLowerCase().trim()
  
  database.prepare(`
    INSERT OR REPLACE INTO artists 
    (name, normalized_name, mbid, area_name, begin_area_name, country_code, lat, lng, city, country, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    artistName,
    normalizedName,
    mbid,
    areaName,
    beginAreaName,
    countryCode,
    lat,
    lng,
    city,
    country
  )
}

export function getAllArtistsFromDB(): string[] {
  const database = getDatabase()
  const rows = database.prepare('SELECT name FROM artists').all() as { name: string }[]
  return rows.map(r => r.name)
}

export function getArtistsWithoutCoordinates(): string[] {
  const database = getDatabase()
  const rows = database.prepare(`
    SELECT name FROM artists 
    WHERE lat IS NULL OR lng IS NULL
  `).all() as { name: string }[]
  return rows.map(r => r.name)
}

