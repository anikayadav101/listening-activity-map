# 🎵 Listening Map

A beautiful web application that visualizes where your favorite Last.fm artists are from on an interactive world map.

## Features

- 🔐 Last.fm username authentication
- 🗺️ Interactive world map showing artist locations
- 📊 Visualizes your top artists and recently played tracks
- 🌍 Uses MusicBrainz and geocoding APIs to find artist locations
- 📱 Responsive design

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Last.fm API Setup

1. Go to [Last.fm API Accounts](https://www.last.fm/api/account/create)
2. Create a new API account
3. Copy your API Key

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
LASTFM_API_KEY=your_lastfm_api_key
MUSICBRAINZ_USER_AGENT=ListeningMap/1.0.0
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

1. **Authentication**: Users enter their Last.fm username (no password needed)
2. **Data Collection**: The app fetches:
   - Top artists (overall, 12 months, 1 month)
   - Recently played tracks
3. **Location Lookup**: For each artist, the app:
   - First tries MusicBrainz API to find artist location
   - Falls back to geocoding if needed
4. **Visualization**: Artists are plotted on an interactive Leaflet map

## Technologies

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Last.fm API** - Music data
- **Leaflet** - Interactive maps
- **MusicBrainz API** - Artist location data
- **OpenStreetMap Nominatim** - Geocoding

## Notes

- Artist location data may not be available for all artists
- The app caches location data to minimize API calls
- MusicBrainz API has rate limits (requests are throttled to 1 per second)
- You need a Last.fm account to use this app (sign up at [last.fm/join](https://www.last.fm/join))

## License

MIT

