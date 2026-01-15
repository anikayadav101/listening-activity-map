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
      // Client-side verification - call Last.fm API directly
      const { getUserInfo } = await import('@/lib/lastfmClient')
      const userInfo = await getUserInfo(username.trim())
      
      if (!userInfo.exists) {
        throw new Error('Last.fm username not found. Please check your username and try again.')
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
    
    const savedUsername = localStorage.getItem('lastfm_username')
    if (!savedUsername) {
      setError('Please log in first')
      setLoading(false)
      return
    }
    
    try {
      // Client-side: Fetch artists directly from Last.fm API
      const { getTopArtists, getRecentTracks } = await import('@/lib/lastfmClient')
      const { getLocationFromMusicBrainzDB } = await import('@/lib/musicbrainzDB')
      const { saveLocationToDB } = await import('@/lib/artistLocationDB')
      
      setLoadingProgress('Fetching top artists from Last.fm...')
      
      // Fetch all artists
      const [topArtistsOverall, recentTracks] = await Promise.allSettled([
        getTopArtists(savedUsername, 'overall', 1000),
        getRecentTracks(savedUsername, 1000),
      ])
      
      const allArtists = new Map<string, Artist>()
      
      // Process top artists
      if (topArtistsOverall.status === 'fulfilled') {
        topArtistsOverall.value.forEach((artist: any) => {
          const artistName = artist.name
          if (artistName) {
            const existing = allArtists.get(artistName) || {
              id: artistName.toLowerCase().trim(),
              name: artistName,
              playcount: 0,
              genres: [],
            }
            existing.playcount = Math.max(
              existing.playcount || 0,
              parseInt(artist.playcount || '0', 10)
            )
            allArtists.set(artistName, existing)
          }
        })
      }
      
      // Process recent tracks
      if (recentTracks.status === 'fulfilled') {
        recentTracks.value.forEach((track: any) => {
          const artistName = track.artist?.['#text'] || track.artist
          if (artistName && !allArtists.has(artistName)) {
            allArtists.set(artistName, {
              id: artistName.toLowerCase().trim(),
              name: artistName,
              playcount: 0,
              genres: [],
            })
          }
        })
      }
      
      const artistsArray = Array.from(allArtists.values())
        .sort((a, b) => (b.playcount || 0) - (a.playcount || 0))
      
      console.log(`Found ${artistsArray.length} total artists from Last.fm`)
      
      // Check MusicBrainz JSON for locations (client-side)
      const { getLocationFromMusicBrainzClient } = await import('@/lib/musicbrainzClient')
      
      const artistsWithLocations = await Promise.all(
        artistsArray.map(async (artist) => {
          const location = await getLocationFromMusicBrainzClient(artist.name)
          return {
            ...artist,
            location: location || undefined,
          }
        })
      )
      
      setArtists(artistsWithLocations)
      setLoadingProgress('')
      setLoading(false)
      
      // Fetch locations in background
      if (artistsWithLocations.length > 0) {
        fetchLocationsInBackground(artistsWithLocations)
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
      // Client-side: Check MusicBrainz JSON for any artists that don't have locations yet
      const { getLocationFromMusicBrainzClient } = await import('@/lib/musicbrainzClient')
      
      const artistsNeedingLocations = artists.filter(a => !a.location)
      console.log(`Checking ${artistsNeedingLocations.length} artists for locations in MusicBrainz JSON...`)
      
      if (artistsNeedingLocations.length === 0) {
        return
      }
      
      // Process in batches to update UI progressively
      const batchSize = 50
      let processed = 0
      let found = 0
      
      for (let i = 0; i < artistsNeedingLocations.length; i += batchSize) {
        const batch = artistsNeedingLocations.slice(i, i + batchSize)
        
        const batchResults = await Promise.all(
          batch.map(async (artist) => {
            const location = await getLocationFromMusicBrainzClient(artist.name)
            return { artist, location }
          })
        )
        
        // Update artists with found locations
        setArtists(prevArtists => 
          prevArtists.map(artist => {
            const result = batchResults.find(r => r.artist.name === artist.name)
            if (result && result.location) {
              found++
              return {
                ...artist,
                location: result.location,
              }
            }
            return artist
          })
        )
        
        processed += batch.length
        setLoadingProgress(`Loading locations... (${processed}/${artistsNeedingLocations.length} checked, ${found} found)`)
        
        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      setLoadingProgress('')
      console.log(`Location check complete: Found ${found} locations`)
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
