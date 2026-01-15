/**
 * Script to download and process MusicBrainz artist location data
 * This creates a local SQLite database with artist locations for fast lookups
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MB_DATA_DIR = path.join(__dirname, '..', 'data', 'musicbrainz');
const DB_PATH = path.join(MB_DATA_DIR, 'artists.db');

// Ensure data directory exists
if (!fs.existsSync(MB_DATA_DIR)) {
  fs.mkdirSync(MB_DATA_DIR, { recursive: true });
}

console.log('Setting up MusicBrainz artist location database...');
console.log('This will download artist data from MusicBrainz API and create a local database.');

// We'll use a Node.js script to fetch artist data via API and store in SQLite
// This avoids needing the full 200GB database

const sqlite3 = require('sqlite3').verbose();

function createDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error creating database:', err);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
      
      db.run(`
        CREATE TABLE IF NOT EXISTS artists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          mbid TEXT,
          area_name TEXT,
          begin_area_name TEXT,
          country_code TEXT,
          lat REAL,
          lng REAL,
          city TEXT,
          country TEXT,
          UNIQUE(normalized_name)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
        } else {
          console.log('Database table created');
          db.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });
  });
}

async function fetchArtistFromMB(artistName) {
  return new Promise((resolve, reject) => {
    const encodedName = encodeURIComponent(artistName);
    const url = `https://musicbrainz.org/ws/2/artist/?query=artist:"${encodedName}"&limit=1&fmt=json`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'ListeningMap/1.0.0 (https://github.com/yourusername/listening-map)'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getArtistDetails(mbid) {
  return new Promise((resolve, reject) => {
    const url = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=area-rels&fmt=json`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'ListeningMap/1.0.0 (https://github.com/yourusername/listening-map)'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function processArtists(artistNames) {
  const db = new sqlite3.Database(DB_PATH);
  
  let processed = 0;
  let found = 0;
  
  for (const artistName of artistNames) {
    try {
      // Rate limit: 1 request per second
      if (processed > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const searchResult = await fetchArtistFromMB(artistName);
      
      if (searchResult.artists && searchResult.artists.length > 0) {
        const artist = searchResult.artists[0];
        const details = await getArtistDetails(artist.id);
        
        // Wait another second for rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const area = details.area || details['begin-area'];
        const location = area ? area.name : null;
        
        if (location) {
          found++;
          const normalizedName = artistName.toLowerCase().trim();
          
          db.run(`
            INSERT OR REPLACE INTO artists 
            (name, normalized_name, mbid, area_name, begin_area_name, country_code)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [
            artistName,
            normalizedName,
            artist.id,
            details.area?.name || null,
            details['begin-area']?.name || null,
            details.country || null
          ]);
        }
      }
      
      processed++;
      if (processed % 10 === 0) {
        console.log(`Processed ${processed}/${artistNames.length} artists, found ${found} locations`);
      }
    } catch (error) {
      console.error(`Error processing ${artistName}:`, error.message);
      processed++;
    }
  }
  
  db.close();
  console.log(`\nComplete! Processed ${processed} artists, found ${found} locations`);
}

// Main execution
async function main() {
  try {
    await createDatabase();
    console.log('\nDatabase created. Now you can import artist data.');
    console.log('To import your artists, run: node scripts/import-artists.js');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createDatabase, processArtists, DB_PATH };

