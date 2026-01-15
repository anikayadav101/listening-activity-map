import fs from 'fs'
import path from 'path'

interface LocationData {
  lat: number
  lng: number
  city?: string
  country?: string
}

interface LocationDatabase {
  [artistName: string]: LocationData | null
}

const DB_PATH = path.join(process.cwd(), 'data', 'artist-locations.json')

// In-memory cache
let locationDB: LocationDatabase = {}
let dbLoaded = false

// Load database from file
function loadDatabase(): LocationDatabase {
  if (dbLoaded) {
    return locationDB
  }

  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Load existing database
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8')
      locationDB = JSON.parse(data)
      console.log(`Loaded ${Object.keys(locationDB).length} artist locations from database`)
    } else {
      locationDB = {}
      // Create empty database file
      fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2))
    }
  } catch (error) {
    console.error('Error loading location database:', error)
    locationDB = {}
  }

  dbLoaded = true
  return locationDB
}

// Save database to file
function saveDatabase() {
  try {
    const dataDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(locationDB, null, 2))
  } catch (error) {
    console.error('Error saving location database:', error)
  }
}

// Get location from database (instant)
export function getLocationFromDB(artistName: string): LocationData | null {
  const db = loadDatabase()
  const normalizedName = artistName.toLowerCase().trim()
  return db[normalizedName] || null
}

// Save location to database
export function saveLocationToDB(artistName: string, location: LocationData | null) {
  const db = loadDatabase()
  const normalizedName = artistName.toLowerCase().trim()
  
  // Only save if it's new or different
  if (db[normalizedName] !== location) {
    db[normalizedName] = location
    saveDatabase()
  }
}

// Batch save locations
export function saveLocationsToDB(locations: Array<{ name: string; location: LocationData | null }>) {
  const db = loadDatabase()
  let updated = false

  locations.forEach(({ name, location }) => {
    const normalizedName = name.toLowerCase().trim()
    if (db[normalizedName] !== location) {
      db[normalizedName] = location
      updated = true
    }
  })

  if (updated) {
    saveDatabase()
  }
}

// Get all locations (for debugging)
export function getAllLocations(): LocationDatabase {
  return loadDatabase()
}


