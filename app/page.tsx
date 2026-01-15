'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import styles from './page.module.css'

// Dynamically import map component to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => <div className={styles.loading}>Loading map...</div>
})

interface Artist {
  id: string
  name: string
  playcount?: number
  genres: string[]
  location?: {
    lat: number
    lng: number
    city?: string
    country?: string
  }
}

// Helper function to format location consistently
function formatLocation(location?: { city?: string; country?: string }): string {
  if (!location) return ''
  
  const city = location.city
  const country = location.country
  
  // If both city and country exist, format as "City, Country"
  if (city && country) {
    return `${city}, ${country}`
  }
  
  // If only city exists, return just city
  if (city) {
    return city
  }
  
  // If only country exists, return just country
  if (country) {
    return country
  }
  
  return ''
}

export default function Home() {
  const [username, setUsername] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [artists, setArtists] = useState<Artist[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [navigateToLocation, setNavigateToLocation] = useState<((lat: number, lng: number, artistId?: string) => void) | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Check if user is already authenticated
    const savedUsername = localStorage.getItem('lastfm_username')
    if (savedUsername) {
      setUsername(savedUsername)
      setIsAuthenticated(true)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      setError('Please enter your Last.fm username')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify username')
      }

      localStorage.setItem('lastfm_username', username.trim())
      setIsAuthenticated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('lastfm_username')
    setIsAuthenticated(false)
    setArtists([])
    setUsername('')
  }

  const fetchListeningData = async () => {
    setLoading(true)
    setError(null)
    setLoadingProgress('Fetching your listening data from Last.fm...')
    try {
      // Fetch artists first (this is now instant)
      const response = await fetch('/api/listening-data')
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch listening data')
      }
      
      console.log('API Response:', data)
      
      if (data.artists && data.artists.length > 0) {
        // Set artists immediately (some locations already included for top 50)
        setArtists(data.artists)
        setLoadingProgress('')
        setLoading(false)
        
        // Always fetch remaining locations in background for all artists
        // Start immediately - don't wait
        console.log(`Starting background location fetch for ${data.artists.length} artists`)
        fetchLocationsInBackground(data.artists)
      } else {
        setArtists([])
        setLoadingProgress('')
        setError(
          data.error || `No artists found. Make sure your Last.fm username is correct and you have listening history.`
        )
        setLoading(false)
      }
    } catch (err) {
      console.error('Error fetching listening data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      setLoadingProgress('')
      setLoading(false)
    }
  }

  const fetchLocationsInBackground = async (artists: Artist[]) => {
    try {
      // Process ALL artists - even if they have locations, we want to make sure we have all of them
      // This ensures we catch any that might have been missed
      console.log(`Starting background location fetch for ALL ${artists.length} artists`)
      
      // Fetch locations for all artists in batches, updating UI progressively
      const batchSize = 25 // Very small batches to avoid rate limiting Wikipedia/APIs
      let startIndex = 0
      let totalLocationsFound = 0
      let batchNumber = 0
      const totalArtists = artists.length
      
      // Update progress indicator
      setLoadingProgress(`Fetching locations... (0/${totalArtists} artists processed)`)
      
      // Process batches with a small delay between them to avoid overwhelming the server
      while (startIndex < totalArtists) {
        try {
          batchNumber++
          const batchStart = startIndex
          const batchEnd = Math.min(startIndex + batchSize, totalArtists)
          console.log(`Fetching batch ${batchNumber}: artists ${batchStart} to ${batchEnd} (${batchEnd - batchStart} artists)`)
          
          // Update progress
          setLoadingProgress(`Fetching locations... (${batchEnd}/${totalArtists} artists processed, ${totalLocationsFound} locations found)`)
          
          // Create abort controller for timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 second timeout per batch
          
          const response = await fetch('/api/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              artists: artists.map(a => ({ name: a.name })),
              startIndex,
              batchSize,
            }),
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (response.ok) {
            const data = await response.json()
            const locationMap = new Map(
              data.locations.map((item: { name: string; location: any }) => [item.name, item.location])
            )
            
            // Count how many locations we found in this batch
            const locationsFound = Array.from(locationMap.values()).filter(loc => loc && typeof loc === 'object' && 'lat' in loc).length
            totalLocationsFound += locationsFound
            console.log(`Batch ${startIndex}-${startIndex + batchSize}: Found ${locationsFound} new locations (${totalLocationsFound} total)`)
            
            // Update artists with locations progressively
            setArtists(prevArtists => 
              prevArtists.map(artist => {
                const newLocation = locationMap.get(artist.name)
                // Only update if we have a valid location with lat/lng
                if (newLocation && typeof newLocation === 'object' && 'lat' in newLocation && 'lng' in newLocation) {
                  return {
                    ...artist,
                    location: newLocation as Artist['location'],
                  }
                }
                return artist
              })
            )
            
            // Always continue to next batch - don't rely on hasMore flag
            startIndex = data.nextIndex || (startIndex + batchSize)
            
            // Check if we've processed all artists
            if (startIndex >= totalArtists) {
              console.log(`Finished fetching all locations. Total: ${totalLocationsFound} locations found out of ${totalArtists} artists`)
              break
            }
            
            // Small delay between batches to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 200))
          } else {
            const errorText = await response.text()
            console.warn(`Error response ${response.status} for batch starting at ${startIndex}: ${errorText}`)
            // Continue to next batch even on error
            startIndex += batchSize
            await new Promise(resolve => setTimeout(resolve, 500)) // Wait a bit before retrying
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.warn(`Batch starting at ${startIndex} timed out, continuing...`)
          } else {
            console.error(`Error fetching batch starting at ${startIndex}:`, err.message || err)
          }
          // Continue to next batch even on error
          startIndex += batchSize
          await new Promise(resolve => setTimeout(resolve, 500)) // Wait a bit before retrying
        }
      }
      
      console.log(`Background location fetch completed. Processed ${startIndex}/${totalArtists} artists, found ${totalLocationsFound} total locations`)
      
      // Final update to show all locations found
      const finalCount = artists.filter(a => a.location).length
      console.log(`Final count: ${finalCount} artists with locations out of ${totalArtists} total`)
      setLoadingProgress('') // Clear progress when done
    } catch (err) {
      console.error('Fatal error in background location fetch:', err)
      setLoadingProgress('') // Clear progress on error
      // Don't show error - locations are optional
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Listening Map</h1>
          <p className={styles.subtitle}>
            Discover where your favorite artists are from around the world
          </p>
        </header>

        {!isAuthenticated ? (
          <div className={styles.authSection}>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your Last.fm username"
                className={styles.usernameInput}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className={styles.loginButton}
              >
                {loading ? 'Verifying...' : 'Connect with Last.fm'}
              </button>
            </form>
            {error && <div className={styles.error}>{error}</div>}
            <p className={styles.info}>
              Enter your Last.fm username to see where all your favorite artists
              are from on an interactive world map
            </p>
            <p className={styles.infoSmall}>
              Don't have a Last.fm account?{' '}
              <a
                href="https://www.last.fm/join"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Sign up for free
              </a>
            </p>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.userInfo}>
              <p>
                Logged in as: <strong>{username}</strong>
              </p>
            </div>
            <div className={styles.controls}>
              <button
                onClick={fetchListeningData}
                disabled={loading}
                className={styles.fetchButton}
              >
                {loading ? 'Loading...' : 'Load My Listening Data'}
              </button>
              <button onClick={handleLogout} className={styles.logoutButton}>
                Logout
              </button>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            {loadingProgress && (
              <div className={styles.progress}>
                {loadingProgress}
                <div className={styles.globe}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="7" stroke="#000000" strokeWidth="1" fill="none"/>
                    <ellipse cx="8" cy="8" rx="7" ry="3.5" stroke="#000000" strokeWidth="1" fill="none"/>
                    <line x1="8" y1="1" x2="8" y2="15" stroke="#000000" strokeWidth="1"/>
                    <line x1="1" y1="8" x2="15" y2="8" stroke="#000000" strokeWidth="1"/>
                    <path d="M 3 5 Q 8 4 13 5" stroke="#000000" strokeWidth="1" fill="none"/>
                    <path d="M 3 11 Q 8 12 13 11" stroke="#000000" strokeWidth="1" fill="none"/>
                  </svg>
                </div>
              </div>
            )}

            {artists.length > 0 && (
              <div className={styles.stats}>
                <p>
                  {artists.some(a => a.location) 
                    ? `Showing ${artists.length} artists (${artists.filter(a => a.location).length} with locations)`
                    : `Found ${artists.length} artists - location lookup in progress...`
                  }
                </p>
              </div>
            )}

            <div className={styles.mapContainer} ref={mapContainerRef}>
              <MapComponent 
                artists={artists} 
                onMapReady={(navigateFn) => setNavigateToLocation(() => navigateFn)}
              />
            </div>

            {artists.length > 0 && (
              <div className={styles.artistList}>
                <h2 className={styles.artistListTitle}>All Artists ({artists.length})</h2>
                <div className={styles.artistGrid}>
                  {artists.map((artist) => (
                    <div 
                      key={artist.id} 
                      className={`${styles.artistCard} ${artist.location ? styles.clickable : ''}`}
                      onClick={() => {
                        if (artist.location && navigateToLocation) {
                          // Scroll to map first
                          if (mapContainerRef.current) {
                            mapContainerRef.current.scrollIntoView({ 
                              behavior: 'smooth', 
                              block: 'start' 
                            })
                          }
                          // Then navigate to artist location
                          setTimeout(() => {
                            navigateToLocation(artist.location!.lat, artist.location!.lng, artist.id)
                          }, 100) // Small delay to ensure scroll starts
                        }
                      }}
                      style={artist.location ? { cursor: 'pointer' } : {}}
                    >
                      <h3 style={artist.location ? { textDecoration: 'underline', textDecorationThickness: '1px', textUnderlineOffset: '2px' } : {}}>
                        {artist.name}
                      </h3>
                      {artist.playcount && (
                        <p className={styles.playcount}>
                          {artist.playcount.toLocaleString()} plays
                        </p>
                      )}
                      {artist.location && (
                        <p className={styles.location}>
                          {formatLocation(artist.location)}
                        </p>
                      )}
                      {!artist.location && (
                        <p className={styles.noLocation}>Location not available</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
