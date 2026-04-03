const express = require('express');
const router = express.Router();
const axios = require('axios');
const Player = require('../models/Player');

function getTieredHomeRunPoints(homeRunsInGame) {
  const hrCount = Math.max(0, Number(homeRunsInGame) || 0);
  if (hrCount === 0) return 0;

  const tierValues = [1, 3, 6, 8, 30];
  let points = 0;
  for (let i = 0; i < hrCount; i++) {
    points += tierValues[Math.min(i, tierValues.length - 1)];
  }
  return points;
}

function resolveWalkOffHomeRuns(statLine, homeRunsInGame) {
  const directWalkOffHr = Number(statLine?.walkOffHomeRuns ?? statLine?.walkOffHomeruns);
  if (Number.isFinite(directWalkOffHr) && directWalkOffHr > 0) {
    return Math.min(Number(homeRunsInGame) || 0, Math.floor(directWalkOffHr));
  }

  const genericWalkOffs = Number(statLine?.walkOffs);
  if (Number.isFinite(genericWalkOffs) && genericWalkOffs > 0) {
    return Math.min(Number(homeRunsInGame) || 0, Math.floor(genericWalkOffs));
  }

  return 0;
}

function normalizeGameDate(split) {
  const raw = split?.date || split?.game?.gameDate || null;
  if (!raw) return null;
  const value = String(raw);
  return value.length >= 10 ? value.slice(0, 10) : null;
}

async function resolveMlbPlayerId(player) {
  if (player?.mlbPlayerId) return player.mlbPlayerId;

  const search = await axios.get('https://statsapi.mlb.com/api/v1/people/search', {
    params: { names: player.name },
    timeout: 15000
  });

  return search.data?.people?.[0]?.id || null;
}

// Batch endpoint: Get fantasy points for all players for a season
router.get('/fantasy-points/batch', async (req, res) => {
  try {
    const season = Number(req.query.season);
    if (!Number.isFinite(season)) {
      return res.status(400).json({ message: 'season query param is required (e.g. ?season=2025)' });
    }

    const players = await Player.find({});
    const results = [];

    async function calculateFantasyPoints(player) {
      const mlbPlayerId = await resolveMlbPlayerId(player);
      if (!mlbPlayerId) return null;
      const isPitcher = String(player.position || '').toUpperCase().includes('P');
      const group = isPitcher ? 'pitching' : 'hitting';
      const response = await axios.get(`https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats`, {
        params: { stats: 'gameLog', season, group },
        timeout: 20000
      });
      const rawSplits = response.data?.stats?.[0]?.splits || [];
      let totalPoints = 0;
      let totalHomeRuns = 0;
      let totalWalkOffHomeRuns = 0;
      let totalStrikeoutsThrown = 0;
      for (const split of rawSplits) {
        const stat = split?.stat || {};
        if (isPitcher) {
          const strikeoutsThrown = Math.max(0, Number(stat?.strikeOuts) || 0);
          totalStrikeoutsThrown += strikeoutsThrown;
          totalPoints += strikeoutsThrown * 0.5;
        } else {
          const homeRuns = Math.max(0, Number(stat?.homeRuns) || 0);
          const walkOffHomeRuns = resolveWalkOffHomeRuns(stat, homeRuns);
          const hrPoints = getTieredHomeRunPoints(homeRuns);
          const walkOffBonusPoints = walkOffHomeRuns * 3;
          totalHomeRuns += homeRuns;
          totalWalkOffHomeRuns += walkOffHomeRuns;
          totalPoints += hrPoints + walkOffBonusPoints;
        }
      }

      return {
        playerId: player._id,
        mlbPlayerId,
        season,
        role: isPitcher ? 'pitcher' : 'hitter',
        totals: {
          fantasyPoints: totalPoints,
          homeRuns: totalHomeRuns,
          walkOffHomeRuns: totalWalkOffHomeRuns,
          strikeoutsThrown: totalStrikeoutsThrown
        }
      };
    }

    for (const player of players) {
      const cached = player.fantasyPointsBySeason && player.fantasyPointsBySeason[season];
      if (cached && typeof cached.fantasyPoints === 'number') {
        results.push({
          playerId: player._id,
          mlbPlayerId: player.mlbPlayerId,
          season,
          role: String(player.position || '').toUpperCase().includes('P') ? 'pitcher' : 'hitter',
          totals: cached
        });
        continue;
      }

      const points = await calculateFantasyPoints(player);
      if (points) {
        player.fantasyPointsBySeason = player.fantasyPointsBySeason || {};
        player.fantasyPointsBySeason[season] = points.totals;
        await player.save();
        results.push(points);
      } else {
        results.push({
          playerId: player._id,
          mlbPlayerId: player.mlbPlayerId,
          season,
          role: String(player.position || '').toUpperCase().includes('P') ? 'pitcher' : 'hitter',
          totals: { fantasyPoints: 0, homeRuns: 0, walkOffHomeRuns: 0, strikeoutsThrown: 0 }
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('[API] Error in batch fantasy points:', err.message);
    res.status(500).json({ message: err.message || 'Failed to calculate batch fantasy points' });
  }
});

// Get all players (sorted by home runs)
router.get('/', async (req, res) => {
  try {
    console.log('[API] GET /api/players - Fetching all players');
    const players = await Player.find({}).sort({ homeruns: -1 });
    console.log(`[API] Found ${players.length} players`);
    console.log(`[API] Sample player:`, players[0]);
    res.json(players);
  } catch (err) {
    console.error('[API] Error fetching players:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Get a single player by ID
router.get('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get official MLB stats for a player/season (used to correct rounded feed values)
router.get('/:id/official-stats', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    const season = Number(req.query.season);
    if (!Number.isFinite(season)) {
      return res.status(400).json({ message: 'season query param is required (e.g. ?season=2025)' });
    }

    const mlbPlayerId = await resolveMlbPlayerId(player);

    if (!mlbPlayerId) {
      return res.status(404).json({ message: 'Official MLB player id not found for this player' });
    }

    const groups = ['hitting', 'pitching'];
    const official = {};

    for (const group of groups) {
      const response = await axios.get(`https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats`, {
        params: { stats: 'season', season, group },
        timeout: 15000
      });
      const stat = response.data?.stats?.[0]?.splits?.[0]?.stat;
      if (!stat) continue;

      if (group === 'hitting') {
        if (stat.avg !== undefined) official.AVG = Number(stat.avg);
        if (stat.obp !== undefined) official.OBP = Number(stat.obp);
        if (stat.ops !== undefined) official.OPS = Number(stat.ops);
        if (stat.homeRuns !== undefined) official.HR = Number(stat.homeRuns);
        if (stat.rbi !== undefined) official.RBI = Number(stat.rbi);
        if (stat.stolenBases !== undefined) official.SB = Number(stat.stolenBases);
      }

      if (group === 'pitching') {
        if (stat.era !== undefined) official.ERA = Number(stat.era);
        if (stat.whip !== undefined) official.WHIP = Number(stat.whip);
        if (stat.strikeOuts !== undefined) official.K = Number(stat.strikeOuts);
      }
    }

    res.json({
      playerId: player._id,
      mlbPlayerId,
      season,
      stats: official
    });
  } catch (err) {
    console.error('[API] Error fetching official MLB stats:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Get fantasy points for a player/season using per-game scoring rules.
// HR points per game: 1st=1, 2nd=3, 3rd=6, 4th=8, 5th+=30. Walk-off HR bonus: +3 each.
// Pitching strikeouts thrown: 0.5 point each.
router.get('/:id/fantasy-points', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    const season = Number(req.query.season);
    if (!Number.isFinite(season)) {
      return res.status(400).json({ message: 'season query param is required (e.g. ?season=2025)' });
    }

    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const hasDateRange = Boolean(startDate && endDate);
    if ((startDate && !endDate) || (!startDate && endDate)) {
      return res.status(400).json({ message: 'startDate and endDate must be provided together (YYYY-MM-DD)' });
    }
    if (hasDateRange && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return res.status(400).json({ message: 'startDate and endDate must use YYYY-MM-DD format' });
    }

    const mlbPlayerId = await resolveMlbPlayerId(player);
    if (!mlbPlayerId) {
      return res.status(404).json({ message: 'Official MLB player id not found for this player' });
    }

    const isPitcher = String(player.position || '').toUpperCase().includes('P');
    const group = isPitcher ? 'pitching' : 'hitting';

    const response = await axios.get(`https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats`, {
      params: { stats: 'gameLog', season, group },
      timeout: 20000
    });

    const rawSplits = response.data?.stats?.[0]?.splits || [];
    const splits = hasDateRange
      ? rawSplits.filter((split) => {
        const gameDate = normalizeGameDate(split);
        return gameDate && gameDate >= startDate && gameDate <= endDate;
      })
      : rawSplits;

    if (!Array.isArray(splits) || splits.length === 0) {
      return res.json({
        playerId: player._id,
        mlbPlayerId,
        season,
        startDate: hasDateRange ? startDate : undefined,
        endDate: hasDateRange ? endDate : undefined,
        role: isPitcher ? 'pitcher' : 'hitter',
        totals: {
          fantasyPoints: 0,
          homeRuns: 0,
          walkOffHomeRuns: 0,
          strikeoutsThrown: 0
        },
        gameBreakdown: []
      });
    }

    let totalPoints = 0;
    let totalHomeRuns = 0;
    let totalWalkOffHomeRuns = 0;
    let totalStrikeoutsThrown = 0;

    const gameBreakdown = splits.map((split) => {
      const stat = split?.stat || {};
      const gameDate = split?.date || split?.game?.gameDate || null;

      if (isPitcher) {
        const strikeoutsThrown = Math.max(0, Number(stat?.strikeOuts) || 0);
        const gamePoints = strikeoutsThrown * 0.5;

        totalStrikeoutsThrown += strikeoutsThrown;
        totalPoints += gamePoints;

        return {
          gameDate,
          homeRuns: 0,
          walkOffHomeRuns: 0,
          strikeoutsThrown,
          points: gamePoints
        };
      }

      const homeRuns = Math.max(0, Number(stat?.homeRuns) || 0);
      const walkOffHomeRuns = resolveWalkOffHomeRuns(stat, homeRuns);
      const hrPoints = getTieredHomeRunPoints(homeRuns);
      const walkOffBonusPoints = walkOffHomeRuns * 3;
      const gamePoints = hrPoints + walkOffBonusPoints;

      totalHomeRuns += homeRuns;
      totalWalkOffHomeRuns += walkOffHomeRuns;
      totalPoints += gamePoints;

      return {
        gameDate,
        homeRuns,
        walkOffHomeRuns,
        strikeoutsThrown: 0,
        points: gamePoints
      };
    });

    res.json({
      playerId: player._id,
      mlbPlayerId,
      season,
      startDate: hasDateRange ? startDate : undefined,
      endDate: hasDateRange ? endDate : undefined,
      role: isPitcher ? 'pitcher' : 'hitter',
      totals: {
        fantasyPoints: totalPoints,
        homeRuns: totalHomeRuns,
        walkOffHomeRuns: totalWalkOffHomeRuns,
        strikeoutsThrown: totalStrikeoutsThrown
      },
      gameBreakdown
    });
  } catch (err) {
    console.error('[API] Error calculating fantasy points:', err.message);
    res.status(500).json({ message: err.message || 'Failed to calculate fantasy points' });
  }
});

// Create a new player
router.post('/', async (req, res) => {
  const player = new Player({
    name: req.body.name,
    team: req.body.team,
    position: req.body.position,
    homeruns: req.body.homeruns || 0,
    strikeouts: req.body.strikeouts || 0,
    photoUrl: req.body.photoUrl || '',
    mlbPlayerId: req.body.mlbPlayerId || null,
    stats: req.body.stats || {},
    statsBySeason: req.body.statsBySeason || {},
    isActive: req.body.isActive !== false
  });

  try {
    const newPlayer = await player.save();
    res.status(201).json(newPlayer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update a player
router.put('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    if (req.body.name) player.name = req.body.name;
    if (req.body.team) player.team = req.body.team;
    if (req.body.position) player.position = req.body.position;
    if (req.body.homeruns !== undefined) player.homeruns = req.body.homeruns;
    if (req.body.strikeouts !== undefined) player.strikeouts = req.body.strikeouts;
    if (req.body.photoUrl !== undefined) player.photoUrl = req.body.photoUrl;
    if (req.body.mlbPlayerId !== undefined) player.mlbPlayerId = req.body.mlbPlayerId;
    if (req.body.stats !== undefined) player.stats = req.body.stats;
    if (req.body.statsBySeason !== undefined) player.statsBySeason = req.body.statsBySeason;
    if (req.body.isActive !== undefined) player.isActive = req.body.isActive;

    const updatedPlayer = await player.save();
    res.json(updatedPlayer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a player
router.delete('/:id', async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    await Player.findByIdAndDelete(req.params.id);
    res.json({ message: 'Player deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
