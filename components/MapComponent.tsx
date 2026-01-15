'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  })
}

interface Artist {
  id: string
  name: string
  popularity?: number
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

interface MapComponentProps {
  artists: Artist[]
  onMapReady?: (navigateToLocation: (lat: number, lng: number, artistId?: string) => void) => void
}

// Component to handle map instance and navigation
function MapController({ 
  artists, 
  onMapReady,
  markersRef 
}: { 
  artists: Artist[]
  onMapReady?: (navigateToLocation: (lat: number, lng: number, artistId?: string) => void) => void
  markersRef: React.MutableRefObject<Map<string, L.Marker>>
}) {
  const map = useMap()

  // Function to navigate to a specific location
  const navigateToLocation = useCallback((lat: number, lng: number, artistId?: string) => {
    map.setView([lat, lng], 10, {
      animate: true,
      duration: 0.5,
    })
    
    // Open popup for the artist if ID is provided
    if (artistId) {
      setTimeout(() => {
        // Find marker by artist ID (most reliable)
        const marker = markersRef.current.get(artistId)
        if (marker) {
          marker.openPopup()
        } else {
          // Fallback: find by exact coordinates and artist name
          const artist = artists.find(a => a.id === artistId && a.location)
          if (artist && artist.location) {
            map.eachLayer((layer) => {
              if (layer instanceof L.Marker) {
                const position = layer.getLatLng()
                // Use tighter tolerance for exact match
                if (
                  Math.abs(position.lat - artist.location!.lat) < 0.0001 &&
                  Math.abs(position.lng - artist.location!.lng) < 0.0001
                ) {
                  // Check if this marker's popup contains the artist name
                  const popup = layer.getPopup()
                  if (popup && popup.getContent()?.includes(artist.name)) {
                    layer.openPopup()
                  }
                }
              }
            })
          }
        }
      }, 600) // Wait for animation to complete
    }
  }, [map, artists, markersRef])

  useEffect(() => {
    if (onMapReady) {
      onMapReady(navigateToLocation)
    }
  }, [onMapReady, navigateToLocation])

  // Auto-fit bounds when artists change
  useEffect(() => {
    const artistsWithLocation = artists.filter((artist) => artist.location)
    if (artistsWithLocation.length > 0) {
      const bounds = L.latLngBounds(
        artistsWithLocation.map((artist) => [
          artist.location!.lat,
          artist.location!.lng,
        ])
      )
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (artists.length === 0) {
      // Reset to world view if no artists
      map.setView([20, 0], 2)
    }
  }, [artists, map])

  return null
}

// Individual marker component that registers itself
function ArtistMarker({ 
  artist, 
  markersRef 
}: { 
  artist: Artist
  markersRef: React.MutableRefObject<Map<string, L.Marker>>
}) {
  if (!artist.location) return null

  const icon = L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: #000000;
      width: 10px;
      height: 10px;
      border: 1px solid #ffffff;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    " title="${artist.name}"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })

  return (
    <Marker
      position={[artist.location.lat, artist.location.lng]}
      icon={icon}
      eventHandlers={{
        add: (e) => {
          // Register marker when it's added to the map using artist ID as key
          const marker = e.target as L.Marker
          markersRef.current.set(artist.id, marker)
        },
        click: (e) => {
          // Open popup on click
          const marker = e.target as L.Marker
          marker.openPopup()
        },
      }}
    >
      <Popup>
        <div style={{ textAlign: 'left', minWidth: '150px', padding: '0.5rem' }}>
          <div style={{ fontSize: '0.9em', fontWeight: '600', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {artist.name}
          </div>
          {formatLocation(artist.location) && (
            <div style={{ color: '#666', marginBottom: '0.5rem', fontSize: '0.75em', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
              {formatLocation(artist.location)}
            </div>
          )}
          {artist.playcount && (
            <div style={{ color: '#666', fontWeight: '400', marginBottom: '0.5rem', fontSize: '0.75em' }}>
              {artist.playcount.toLocaleString()} plays
            </div>
          )}
          {artist.genres.length > 0 && (
            <div style={{ fontSize: '0.7em', color: '#666', fontStyle: 'normal', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
              {artist.genres.slice(0, 2).join(', ')}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}

export default function MapComponent({ artists, onMapReady }: MapComponentProps) {
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  const artistsWithLocation = useMemo(() => 
    artists.filter((artist) => artist.location),
    [artists]
  )

  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      style={{ height: '100%', width: '100%', backgroundColor: '#ffffff' }}
      scrollWheelZoom={true}
      zoomControl={true}
      doubleClickZoom={true}
      dragging={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains={['a', 'b', 'c']}
        minZoom={0}
        maxZoom={19}
      />
      
      <MapController artists={artists} onMapReady={onMapReady} markersRef={markersRef} />
      
      {artistsWithLocation.map((artist) => (
        <ArtistMarker key={artist.id} artist={artist} markersRef={markersRef} />
      ))}
    </MapContainer>
  )
}
