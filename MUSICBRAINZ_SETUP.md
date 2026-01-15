# MusicBrainz Database Setup

This project now uses a local SQLite database to store artist locations from MusicBrainz for fast, accurate lookups.

## How It Works

Instead of downloading the full 200GB MusicBrainz database, we:
1. Use the MusicBrainz API to fetch artist location data
2. Store it in a local SQLite database (`data/musicbrainz/artists.db`)
3. Use this database for instant lookups (no API calls needed after initial import)

## Setup

The database is automatically created when you first use it. To bulk import all your artists:

1. **First, load your Last.fm data** in the web app (this populates the artist list)

2. **Run the bulk import script:**
   ```bash
   npm run import-musicbrainz
   ```

This will:
- Read all artists from your existing database
- Fetch their locations from MusicBrainz API
- Store them in the SQLite database
- Show progress as it processes

**Note:** Due to MusicBrainz rate limits (1 request/second), this takes about 2 seconds per artist. For 900 artists, expect ~30 minutes.

## Benefits

- ✅ **Accurate**: Uses official MusicBrainz data
- ✅ **Fast**: After import, lookups are instant (no API calls)
- ✅ **Complete**: Can find locations for all artists in MusicBrainz
- ✅ **Small**: SQLite database is only a few MB (vs 200GB full database)
- ✅ **Persistent**: Data is saved locally, no need to re-fetch

## Usage

The system automatically checks the MusicBrainz database first when looking up artist locations. If a location is found in the database, it's returned instantly. If not, it falls back to:
1. MusicBrainz API (and saves to DB)
2. Last.fm
3. Wikipedia
4. Geocoding

## Database Location

The database is stored at: `data/musicbrainz/artists.db`

You can inspect it using any SQLite browser or command-line tool:
```bash
sqlite3 data/musicbrainz/artists.db "SELECT * FROM artists LIMIT 10;"
```

