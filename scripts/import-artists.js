/**
 * Import artist locations from MusicBrainz into local database
 * Reads artists from your Last.fm data and fetches their locations
 */

const { processArtists, DB_PATH } = require('./setup-musicbrainz-db');
const fs = require('fs');
const path = require('path');

// Read artists from the existing database or from Last.fm
async function getArtistsToImport() {
  // Try to read from existing location database
  const locationDBPath = path.join(__dirname, '..', 'data', 'artist-locations.json');
  
  if (fs.existsSync(locationDBPath)) {
    const data = JSON.parse(fs.readFileSync(locationDBPath, 'utf-8'));
    // Get all artist names (keys of the object)
    const artists = Object.keys(data).filter(name => !data[name]); // Only get artists without locations
    console.log(`Found ${artists.length} artists without locations to import`);
    return artists;
  }
  
  console.log('No existing artist database found. Please load your Last.fm data first.');
  return [];
}

async function main() {
  const artists = await getArtistsToImport();
  
  if (artists.length === 0) {
    console.log('No artists to import. Please load your Last.fm data first.');
    return;
  }
  
  console.log(`\nStarting import of ${artists.length} artists...`);
  console.log('This will take a while due to MusicBrainz rate limits (1 req/sec)');
  console.log(`Estimated time: ~${Math.ceil(artists.length / 60)} minutes\n`);
  
  await processArtists(artists);
  
  console.log('\nImport complete! The database is now ready to use.');
}

if (require.main === module) {
  main().catch(console.error);
}

