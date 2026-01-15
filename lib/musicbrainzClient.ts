/**
 * Client-side MusicBrainz location lookup (for static/GitHub Pages deployment)
 * Uses JSON file instead of SQLite database
 */

let locationCache: Record<string, { lat: number; lng: number; city?: string; country?: string }> | null = null

async function loadLocationData(): Promise<Record<string, { lat: number; lng: number; city?: string; country?: string }>> {
  if (locationCache) {
    return locationCache
  }
  
  try {
    // Load from public JSON file
    // Use relative path - works for both GitHub Pages subpath and custom domains
    const basePath = typeof window !== 'undefined' && window.location.pathname.includes('/listening-activity-map') 
      ? '/listening-activity-map' 
      : ''
    const response = await fetch(`${basePath}/musicbrainz-locations.json`)
    if (response.ok) {
      locationCache = await response.json()
      return locationCache || {}
    }
  } catch (error) {
    console.warn('Failed to load MusicBrainz locations JSON:', error)
  }
  
  return {}
}

export async function getLocationFromMusicBrainzClient(artistName: string): Promise<{ lat: number; lng: number; city?: string; country?: string } | null> {
  const locations = await loadLocationData()
  const normalizedName = artistName.toLowerCase().trim()
  
  return locations[normalizedName] || null
}

