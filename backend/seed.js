const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();
const Player = require('./models/Player');

const SPORTSDATA_API_KEY = process.env.SPORTSDATA_API_KEY;

const buildFallbackPhotoUrl = (name) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Player')}&size=128&background=667eea&color=ffffff&bold=true`;

const extractApiPhotoUrl = (player) => (
  player.PhotoUrl ||
  player.Photo ||
  player.HeadshotUrl ||
  player.Headshot ||
  player.PhotoURL ||
  ''
);

const normalizePlayerName = (name = '') => name
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const buildMlbHeadshotUrl = (mlbPlayerId) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${mlbPlayerId}/headshot/67/current`;

const buildStatsPayload = (player) => {
  if (!player || typeof player !== 'object') return {};
  const stats = { ...player };
  delete stats.PhotoUrl;
  delete stats.Photo;
  delete stats.HeadshotUrl;
  delete stats.Headshot;
  delete stats.PhotoURL;
  return stats;
};

async function fetchSeasonStats(season) {
  const statsUrl = `https://api.sportsdata.io/v3/mlb/stats/json/PlayerSeasonStats/${season}`;
  console.log(`Fetching season ${season} from: ${statsUrl}`);

  const response = await axios.get(statsUrl, {
    params: {
      key: SPORTSDATA_API_KEY
    },
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Node.js Baseball App)'
    }
  });

  if (!Array.isArray(response.data)) {
    throw new Error(`Invalid response for season ${season}`);
  }

  return response.data;
}

async function fetchMlbPlayerDirectory() {
  try {
    console.log('Fetching MLB player directory for headshots...');
    const response = await axios.get('https://statsapi.mlb.com/api/v1/sports/1/players', {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Node.js Baseball App)'
      }
    });

    const people = response.data?.people || [];
    const nameToMlbId = new Map();

    for (const person of people) {
      if (!person?.id || !person?.fullName) continue;
      const normalized = normalizePlayerName(person.fullName);
      if (normalized && !nameToMlbId.has(normalized)) {
        nameToMlbId.set(normalized, person.id);
      }
    }

    console.log(`✓ Loaded ${nameToMlbId.size} MLB name-to-headshot mappings\n`);
    return nameToMlbId;
  } catch (err) {
    console.log(`⚠ Could not load MLB player directory: ${err.message}`);
    console.log('Continuing with fallback player avatars.\n');
    return new Map();
  }
}

function buildFallbackPlayers(currentSeason) {
  const rows = [
    { name: 'Aaron Judge', team: 'NYY', position: 'OF', homeruns: 62, strikeouts: 0 },
    { name: 'Shohei Ohtani', team: 'LAD', position: 'DH', homeruns: 54, strikeouts: 0 },
    { name: 'Juan Soto', team: 'NYM', position: 'OF', homeruns: 41, strikeouts: 0 },
    { name: 'Kyle Schwarber', team: 'PHI', position: 'OF', homeruns: 38, strikeouts: 0 },
    { name: 'Mookie Betts', team: 'LAD', position: 'OF', homeruns: 35, strikeouts: 0 },
    { name: 'Bryce Harper', team: 'PHI', position: 'OF', homeruns: 34, strikeouts: 0 },
    { name: 'Corey Seager', team: 'TEX', position: 'SS', homeruns: 33, strikeouts: 0 },
    { name: 'Jose Altuve', team: 'HOU', position: '2B', homeruns: 28, strikeouts: 0 },
    { name: 'Mike Trout', team: 'LAA', position: 'OF', homeruns: 27, strikeouts: 0 },
    { name: 'Freddie Freeman', team: 'LAD', position: '1B', homeruns: 22, strikeouts: 0 },
    { name: 'Brandon Lowe', team: 'TB', position: '2B', homeruns: 15, strikeouts: 0 },
    { name: 'Kyle Higashioka', team: 'NYY', position: 'C', homeruns: 8, strikeouts: 0 },
    { name: 'Salvador Perez', team: 'KC', position: 'C', homeruns: 5, strikeouts: 0 },
    { name: 'Marcus Semien', team: 'TEX', position: '2B', homeruns: 2, strikeouts: 0 },
    { name: 'Xander Bogaerts', team: 'BOS', position: 'SS', homeruns: 1, strikeouts: 0 },
    { name: 'Luis Severino', team: 'NYY', position: 'P', homeruns: 0, strikeouts: 288 },
    { name: 'Max Scherzer', team: 'NYM', position: 'P', homeruns: 0, strikeouts: 270 },
    { name: 'Sandy Alcantara', team: 'MIA', position: 'P', homeruns: 0, strikeouts: 251 },
    { name: 'Gerrit Cole', team: 'NYY', position: 'P', homeruns: 0, strikeouts: 325 },
    { name: 'Clayton Kershaw', team: 'LAD', position: 'P', homeruns: 0, strikeouts: 215 }
  ];

  return rows.map((row) => {
    const currentStats = row.position === 'P' ? { Strikeouts: row.strikeouts } : { HomeRuns: row.homeruns };
    return {
      ...row,
      photoUrl: buildFallbackPhotoUrl(row.name),
      mlbPlayerId: null,
      stats: currentStats,
      statsBySeason: {
        [currentSeason]: currentStats,
        [currentSeason - 1]: currentStats,
        [currentSeason - 2]: currentStats
      },
      isActive: true
    };
  });
}

async function fetchPlayersFromSportsData() {
  try {
    console.log('Fetching player season stats from SportsData.io...');
    console.log(`API Key: ${SPORTSDATA_API_KEY ? '✓ Set' : '✗ Missing'}`);
    
    if (!SPORTSDATA_API_KEY) {
      throw new Error('SPORTSDATA_API_KEY is not set in .env file');
    }

    const currentSeason = new Date().getFullYear();
    const seasons = [currentSeason, currentSeason - 1, currentSeason - 2];
    console.log(`Fetching last 3 seasons: ${seasons.join(', ')}\n`);

    const seasonResults = await Promise.allSettled(
      seasons.map(async (season) => {
        const stats = await fetchSeasonStats(season);
        return [season, stats];
      })
    );

    const statsBySeason = {};
    seasonResults.forEach((result, index) => {
      const season = seasons[index];
      if (result.status === 'fulfilled') {
        const [, stats] = result.value;
        statsBySeason[season] = stats;
        console.log(`✓ Fetched ${stats.length} stats rows for ${season}`);
      } else {
        console.log(`⚠ Could not fetch ${season}: ${result.reason?.message || 'Unknown error'}`);
        statsBySeason[season] = [];
      }
    });

    const playerStats = statsBySeason[currentSeason] || [];

    if (!playerStats.length) {
      throw new Error('No current season stats were returned');
    }

    const seasonIndexes = {};
    seasons.forEach((season) => {
      const byPlayerId = new Map();
      const byName = new Map();
      for (const row of statsBySeason[season] || []) {
        if (row?.PlayerID !== undefined && row?.PlayerID !== null) {
          byPlayerId.set(String(row.PlayerID), row);
        }
        const normalized = normalizePlayerName(row?.Name || '');
        if (normalized && !byName.has(normalized)) {
          byName.set(normalized, row);
        }
      }
      seasonIndexes[season] = { byPlayerId, byName };
    });

    const mlbIdByName = await fetchMlbPlayerDirectory();

    const resolvePhotoUrl = (player) => {
      const apiPhoto = extractApiPhotoUrl(player);
      if (apiPhoto) return apiPhoto;

      const normalizedName = normalizePlayerName(player.Name || 'Unknown');
      const mlbPlayerId = mlbIdByName.get(normalizedName);
      if (mlbPlayerId) return buildMlbHeadshotUrl(mlbPlayerId);

      return buildFallbackPhotoUrl(player.Name || 'Unknown');
    };

    const resolveMlbPlayerId = (player) => {
      const normalizedName = normalizePlayerName(player?.Name || '');
      return mlbIdByName.get(normalizedName) || null;
    };

    const resolveStatsBySeason = (player) => {
      const playerId = player?.PlayerID !== undefined && player?.PlayerID !== null ? String(player.PlayerID) : null;
      const normalizedName = normalizePlayerName(player?.Name || '');
      const result = {};

      seasons.forEach((season) => {
        const index = seasonIndexes[season];
        if (!index) return;

        let row = null;
        if (playerId && index.byPlayerId.has(playerId)) {
          row = index.byPlayerId.get(playerId);
        } else if (normalizedName && index.byName.has(normalizedName)) {
          row = index.byName.get(normalizedName);
        }

        if (row) {
          result[season] = buildStatsPayload(row);
        }
      });

      return result;
    };

    const isPitcherPosition = (position) => {
      const pos = String(position || '').toUpperCase();
      return pos === 'P' || pos.includes('P');
    };
    
    // Separate position players and pitchers
    const positionPlayers = playerStats
      .filter(p => p.Position && !isPitcherPosition(p.Position))
      .sort((a, b) => (b.HomeRuns || 0) - (a.HomeRuns || 0))
      .map(player => ({
        name: player.Name || 'Unknown',
        team: player.Team || 'Unknown',
        position: player.Position || 'Unknown',
        homeruns: player.HomeRuns || 0,
        strikeouts: 0,
        photoUrl: resolvePhotoUrl(player),
        mlbPlayerId: resolveMlbPlayerId(player),
        stats: buildStatsPayload(player),
        statsBySeason: resolveStatsBySeason(player),
        isActive: true
      }));

    // Get ALL active pitchers from API
    const allPitchers = playerStats
      .filter(p => isPitcherPosition(p.Position))
      .sort((a, b) => (b.Strikeouts || b.PitchingStrikeouts || 0) - (a.Strikeouts || a.PitchingStrikeouts || 0))
      .map(player => ({
        name: player.Name || 'Unknown',
        team: player.Team || 'Unknown',
        position: 'P',
        homeruns: 0,
        strikeouts: player.Strikeouts || player.PitchingStrikeouts || 0,
        photoUrl: resolvePhotoUrl(player),
        mlbPlayerId: resolveMlbPlayerId(player),
        stats: buildStatsPayload(player),
        statsBySeason: resolveStatsBySeason(player),
        isActive: true
      }));

    console.log(`Found ${positionPlayers.length} position players and ${allPitchers.length} pitchers\n`);
    
    // If no pitchers found, include all players not in position players
    let allPlayers = [...positionPlayers, ...allPitchers];
    if (allPitchers.length === 0) {
      console.log('No pitchers found with Position=P, including remaining players...\n');
      const usedNames = new Set(positionPlayers.map(p => p.name));
      const remainingPitchers = playerStats
        .filter(p => !usedNames.has(p.Name))
        .sort((a, b) => (b.Strikeouts || b.PitchingStrikeouts || 0) - (a.Strikeouts || a.PitchingStrikeouts || 0))
        .slice(0, 200)
        .map(player => ({
          name: player.Name || 'Unknown',
          team: player.Team || 'Unknown',
          position: player.Position || 'P',
          homeruns: player.HomeRuns || 0,
          strikeouts: player.Strikeouts || player.PitchingStrikeouts || 0,
          photoUrl: resolvePhotoUrl(player),
          mlbPlayerId: resolveMlbPlayerId(player),
          stats: buildStatsPayload(player),
          statsBySeason: resolveStatsBySeason(player),
          isActive: true
        }));
      console.log(`Added ${remainingPitchers.length} remaining players\n`);
      allPlayers = [...positionPlayers, ...remainingPitchers];
    }

    if (allPlayers.length === 0) {
      throw new Error('No players found to return');
    }

    console.log(`✓ Returning ${allPlayers.length} total players\n`);
    console.log(`  - Position Players (all non-pitchers): ${positionPlayers.length}`);
    console.log(`  - Pitchers (all, sorted by strikeouts): ${allPitchers.length || 'N/A'}\n`);
    return allPlayers;
  } catch (err) {
    console.error('⚠ Error fetching from SportsData.io:', err.message);
    console.log('\nFalling back to sample data (includes players with 0 HR)...\n');
    return buildFallbackPlayers(new Date().getFullYear());
  }
}

async function seedDatabase() {
  try {
    console.log('='.repeat(50));
    console.log('Starting database seed...');
    console.log('='.repeat(50) + '\n');
    
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected\n');

    console.log('Clearing existing players...');
    const deleteResult = await Player.deleteMany({});
    console.log(`✓ Cleared ${deleteResult.deletedCount} existing players\n`);

    console.log('Fetching active roster players from SportsData.io...');
    const players = await fetchPlayersFromSportsData();
    
    if (players.length === 0) {
      console.error('✗ No players to insert');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`Inserting ${players.length} players into database...`);
    const insertedPlayers = await Player.insertMany(players);
    console.log(`✓ ${insertedPlayers.length} players inserted successfully\n`);
    
    const posPlayers = insertedPlayers.filter(p => p.position !== 'P').slice(0, 3);
    const pitchers = insertedPlayers.filter(p => p.position === 'P').slice(0, 3);
    
    console.log('Top Position Players:');
    posPlayers.forEach(p => {
      console.log(`  - ${p.name}: ${p.homeruns} HR (${p.team})`);
    });
    
    console.log('\nTop Pitchers (by strikeouts):');
    pitchers.forEach(p => {
      console.log(`  - ${p.name}: ${p.strikeouts} K (${p.team})`);
    });
    
    const totalPitchers = insertedPlayers.filter(p => p.position === 'P').length;
    console.log(`\n  ... (${totalPitchers} total pitchers)`);
    if (insertedPlayers.length > 6) {
      console.log(`  ... and ${insertedPlayers.length - 6} more total players`);
    }
    console.log();

    // Verify insertion
    const count = await Player.countDocuments();
    console.log(`✓ Database now contains ${count} active roster players`);

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
    console.log('='.repeat(50));
    console.log('✓ Seed completed successfully!');
    console.log('='.repeat(50));
  } catch (err) {
    console.error('\n✗ Error seeding database:');
    console.error(err.message);
    process.exit(1);
  }
}

seedDatabase();
