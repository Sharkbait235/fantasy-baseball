const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Draft = require('../models/Draft');
const Player = require('../models/Player');
const Group = require('../models/Group');

const JWT_SECRET = process.env.JWT_SECRET || 'baseball_app_secret_key';

// Middleware to get userId from token (optional - doesn't block if missing)
function getUser(req) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return null;
    const token = auth.split(' ')[1];
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

const HITTER_BENCH_ACCEPTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH'];

const ROSTER_SLOT_TEMPLATE = [
  { key: 'C', accepts: ['C'], isBench: false },
  { key: '1B', accepts: ['1B'], isBench: false },
  { key: '2B', accepts: ['2B'], isBench: false },
  { key: '3B', accepts: ['3B'], isBench: false },
  { key: 'SS', accepts: ['SS'], isBench: false },
  { key: 'LF', accepts: ['LF', 'OF'], isBench: false },
  { key: 'CF', accepts: ['CF', 'OF'], isBench: false },
  { key: 'RF', accepts: ['RF', 'OF'], isBench: false },
  { key: 'DH', accepts: ['DH'], isBench: false },
  { key: 'SP1', accepts: ['SP'], isBench: false },
  { key: 'SP2', accepts: ['SP'], isBench: false },
  { key: 'RP', accepts: ['RP'], isBench: false },
  { key: 'BN1', accepts: HITTER_BENCH_ACCEPTS, isBench: true }
];

const MAX_DRAFT_ROUNDS = ROSTER_SLOT_TEMPLATE.length;
const MAX_BENCH_SLOTS = ROSTER_SLOT_TEMPLATE.filter((slot) => slot.isBench).length;

function normalizePosition(position) {
  const normalized = String(position || '').trim().toUpperCase();
  if (!normalized) return '';
  if (normalized === 'SP' || normalized === 'RP') return normalized;
  if (normalized.includes('P')) return 'P';
  return normalized;
}

function inferPitcherRole(player, preferredSeason) {
  if (!player) return 'RP';

  const statsBySeason = player?.statsBySeason && typeof player.statsBySeason === 'object'
    ? player.statsBySeason
    : {};
  const seasonKeys = Object.keys(statsBySeason)
    .filter((season) => statsBySeason[season] && typeof statsBySeason[season] === 'object')
    .sort((a, b) => Number(b) - Number(a));

  const preferredKey = String(preferredSeason || '');
  const seasonStats = preferredKey && statsBySeason[preferredKey] && typeof statsBySeason[preferredKey] === 'object'
    ? statsBySeason[preferredKey]
    : seasonKeys.length > 0
      ? statsBySeason[seasonKeys[0]]
      : null;

  const stats = seasonStats && typeof seasonStats === 'object'
    ? seasonStats
    : player?.stats && typeof player.stats === 'object'
      ? player.stats
      : {};

  const read = (...keys) => {
    for (const key of keys) {
      const raw = stats?.[key];
      const value = Number(raw);
      if (Number.isFinite(value)) return value;
    }
    return null;
  };

  const gamesStarted = read('GamesStarted', 'Started', 'PitchingGamesStarted', 'GS');
  const gamesPitched = read('Games', 'GamesPitched', 'PitchingGames', 'Appearances', 'GP');
  const saves = read('Saves', 'PitchingSaves', 'SV') || 0;
  const holds = read('Holds', 'PitchingHolds', 'HLD') || 0;
  const gamesFinished = read('GamesFinished', 'PitchingGamesFinished', 'GF') || 0;

  if (Number.isFinite(gamesStarted) && gamesStarted >= 10) return 'SP';

  if (Number.isFinite(gamesStarted) && Number.isFinite(gamesPitched) && gamesPitched > 0) {
    const startRate = gamesStarted / gamesPitched;
    if (startRate >= 0.45) return 'SP';
    if (startRate <= 0.25) return 'RP';
  }

  if (saves > 0 || holds > 0 || gamesFinished > 0) return 'RP';
  if (Number.isFinite(gamesStarted) && gamesStarted > 0) return 'SP';

  return 'RP';
}

function resolveRosterPosition(playerOrPosition, preferredSeason) {
  if (!playerOrPosition) return '';

  if (typeof playerOrPosition === 'object') {
    const normalized = normalizePosition(playerOrPosition.position);
    if (normalized === 'P') return inferPitcherRole(playerOrPosition, preferredSeason);
    return normalized;
  }

  return normalizePosition(playerOrPosition);
}

async function getPositionCountMapForPicks(picks = []) {
  const pickIds = (picks || [])
    .map((pick) => String(pick?.playerId || '').trim())
    .filter(Boolean);

  const positionCountByValue = new Map();
  if (pickIds.length === 0) {
    for (const pick of picks || []) {
      const normalizedFromPick = normalizePosition(pick?.position);
      if (!normalizedFromPick) continue;
      positionCountByValue.set(normalizedFromPick, (positionCountByValue.get(normalizedFromPick) || 0) + 1);
    }
    return positionCountByValue;
  }

  const players = await Player.find(
    { _id: { $in: pickIds } },
    { _id: 1, position: 1, stats: 1, statsBySeason: 1 }
  ).lean();

  const playerById = new Map(players.map((player) => [String(player._id), player]));

  for (const pick of picks) {
    const playerId = String(pick?.playerId || '').trim();
    if (!playerId) continue;

    const persistedPosition = normalizePosition(pick?.position);
    const livePlayer = playerById.get(playerId);
    const normalizedPosition = (persistedPosition && persistedPosition !== 'P')
      ? persistedPosition
      : resolveRosterPosition(livePlayer);
    if (!normalizedPosition) continue;
    positionCountByValue.set(normalizedPosition, (positionCountByValue.get(normalizedPosition) || 0) + 1);
  }

  return positionCountByValue;
}

function buildRosterSlotState() {
  return ROSTER_SLOT_TEMPLATE.map((slot) => ({ ...slot, occupied: false }));
}

function occupySlotForPosition(slots, position) {
  const normalizedPosition = normalizePosition(position);
  if (!normalizedPosition) return null;

  let targetIndex = slots.findIndex(
    (slot) => !slot.occupied && !slot.isBench && slot.accepts.includes(normalizedPosition)
  );

  if (targetIndex < 0) {
    targetIndex = slots.findIndex(
      (slot) => !slot.occupied && slot.isBench && slot.accepts.includes(normalizedPosition)
    );
  }

  if (targetIndex < 0) return null;

  slots[targetIndex].occupied = true;
  return slots[targetIndex].key;
}

function occupyBenchSlot(slots, position) {
  const normalizedPosition = normalizePosition(position);
  const targetIndex = slots.findIndex(
    (slot) => !slot.occupied && slot.isBench && (!normalizedPosition || slot.accepts.includes(normalizedPosition))
  );
  if (targetIndex < 0) return null;
  slots[targetIndex].occupied = true;
  return slots[targetIndex].key;
}

async function buildRosterProgressState(picks = []) {
  const pickIds = (picks || [])
    .map((pick) => String(pick?.playerId || '').trim())
    .filter(Boolean);

  const slots = buildRosterSlotState();
  if (pickIds.length === 0) {
    return {
      slots,
      openActiveSlots: slots.filter((slot) => !slot.occupied && !slot.isBench).length,
      openBenchSlots: slots.filter((slot) => !slot.occupied && slot.isBench).length,
      isComplete: false
    };
  }

  const players = await Player.find(
    { _id: { $in: pickIds } },
    { _id: 1, position: 1, stats: 1, statsBySeason: 1 }
  ).lean();
  const playerById = new Map(players.map((player) => [String(player._id), player]));

  for (const pick of picks || []) {
    const playerId = String(pick?.playerId || '').trim();
    if (!playerId) continue;

    const persistedPosition = normalizePosition(pick?.position);
    const pickPosition = (persistedPosition && persistedPosition !== 'P')
      ? persistedPosition
      : resolveRosterPosition(playerById.get(playerId));
    if (!pickPosition) continue;
    occupySlotForPosition(slots, pickPosition);
  }

  const openActiveSlots = slots.filter((slot) => !slot.occupied && !slot.isBench).length;
  const openBenchSlots = slots.filter((slot) => !slot.occupied && slot.isBench).length;

  return {
    slots,
    openActiveSlots,
    openBenchSlots,
    isComplete: openActiveSlots === 0 && openBenchSlots === 0
  };
}

async function resolveEffectiveBenchPlayerIds(userSlot) {
  const context = await resolveRosterContext(userSlot);
  return context.effectiveBenchIds;
}

async function resolveRosterContext(userSlot) {
  const picks = userSlot?.picks || [];
  if (picks.length === 0) {
    return { effectiveBenchIds: [], slotByPlayerId: new Map(), positionByPlayerId: new Map() };
  }

  const pickIds = picks
    .map((pick) => String(pick.playerId || '').trim())
    .filter(Boolean);
  if (pickIds.length === 0) {
    return { effectiveBenchIds: [], slotByPlayerId: new Map(), positionByPlayerId: new Map() };
  }

  const pickIdSet = new Set(pickIds);
  const existingBenchIds = (userSlot?.benchPlayerIds || [])
    .map((id) => String(id || '').trim())
    .filter((id) => id && pickIdSet.has(id));

  const existingBenchSet = new Set(existingBenchIds);
  const players = await Player.find(
    { _id: { $in: [...pickIdSet] } },
    { _id: 1, position: 1, stats: 1, statsBySeason: 1 }
  ).lean();
  const positionByPlayerId = new Map(
    players.map((player) => [String(player._id), resolveRosterPosition(player)])
  );

  const slots = buildRosterSlotState();
  const effectiveBenchIds = [];
  const slotByPlayerId = new Map();

  // Place explicitly benched players first into bench slots when possible.
  for (const benchPlayerId of existingBenchIds) {
    const occupiedKey = occupyBenchSlot(slots, positionByPlayerId.get(benchPlayerId) || '');
    if (!occupiedKey) break;
    effectiveBenchIds.push(benchPlayerId);
    slotByPlayerId.set(benchPlayerId, occupiedKey);
  }

  // Then place all remaining picks into active slots, falling back to bench.
  for (const pick of picks) {
    const playerId = String(pick.playerId || '').trim();
    if (!playerId) continue;
    if (effectiveBenchIds.includes(playerId)) continue;

    const position = positionByPlayerId.get(playerId) || '';

    let occupiedSlot = null;
    if (existingBenchSet.has(playerId)) {
      occupiedSlot = occupyBenchSlot(slots, position);
    }

    if (!occupiedSlot) {
      occupiedSlot = occupySlotForPosition(slots, position);
    }

    if (occupiedSlot && String(occupiedSlot).startsWith('BN')) {
      effectiveBenchIds.push(playerId);
    }
    if (occupiedSlot) {
      slotByPlayerId.set(playerId, String(occupiedSlot));
    }
  }

  return { effectiveBenchIds, slotByPlayerId, positionByPlayerId };
}

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

async function resolveMlbPlayerId(player) {
  if (player?.mlbPlayerId) return player.mlbPlayerId;

  const search = await axios.get('https://statsapi.mlb.com/api/v1/people/search', {
    params: { names: player.name },
    timeout: 15000
  });

  return search.data?.people?.[0]?.id || null;
}

function getLatestSeasonForPlayer(player) {
  const statsBySeason = player?.statsBySeason && typeof player.statsBySeason === 'object'
    ? player.statsBySeason
    : {};

  const seasons = Object.keys(statsBySeason)
    .filter((season) => statsBySeason[season] && typeof statsBySeason[season] === 'object')
    .sort((a, b) => Number(b) - Number(a));

  return Number(seasons[0] || new Date().getFullYear());
}

function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // Sunday

  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Saturday
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function normalizeGameDate(split) {
  const raw = split?.date || split?.game?.gameDate || null;
  if (!raw) return null;
  const value = String(raw);
  return value.length >= 10 ? value.slice(0, 10) : null;
}

function formatLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function getFantasyPointsForPlayerSeason(player, season, requestCache) {
  const cacheKey = `${player._id}-${season}`;
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

  let points = 0;
  try {
    const mlbPlayerId = await resolveMlbPlayerId(player);
    if (!mlbPlayerId) {
      requestCache.set(cacheKey, 0);
      return 0;
    }

    const isPitcher = String(player.position || '').toUpperCase().includes('P');
    const group = isPitcher ? 'pitching' : 'hitting';

    const response = await axios.get(`https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats`, {
      params: { stats: 'gameLog', season, group },
      timeout: 20000
    });

    const splits = response.data?.stats?.[0]?.splits || [];
    if (isPitcher) {
      points = splits.reduce((sum, split) => sum + (Math.max(0, Number(split?.stat?.strikeOuts) || 0) * 0.5), 0);
    } else {
      points = splits.reduce((sum, split) => {
        const homeRuns = Math.max(0, Number(split?.stat?.homeRuns) || 0);
        const walkOffHomeRuns = resolveWalkOffHomeRuns(split?.stat || {}, homeRuns);
        return sum + getTieredHomeRunPoints(homeRuns) + (walkOffHomeRuns * 3);
      }, 0);
    }
  } catch {
    points = 0;
  }

  requestCache.set(cacheKey, points);
  return points;
}

async function getFantasyPointsForPlayerDateRange(player, season, startDate, endDate, requestCache) {
  const startKey = formatLocalDateKey(startDate);
  const endKey = formatLocalDateKey(endDate);
  const cacheKey = `${player._id}-${season}-${startKey}-${endKey}`;
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

  let points = 0;
  try {
    const mlbPlayerId = await resolveMlbPlayerId(player);
    if (!mlbPlayerId) {
      requestCache.set(cacheKey, 0);
      return 0;
    }

    const isPitcher = String(player.position || '').toUpperCase().includes('P');
    const group = isPitcher ? 'pitching' : 'hitting';

    const response = await axios.get(`https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats`, {
      params: { stats: 'gameLog', season, group },
      timeout: 20000
    });

    const splits = (response.data?.stats?.[0]?.splits || []).filter((split) => {
      const gameDate = normalizeGameDate(split);
      return gameDate && gameDate >= startKey && gameDate <= endKey;
    });

    if (isPitcher) {
      points = splits.reduce((sum, split) => sum + (Math.max(0, Number(split?.stat?.strikeOuts) || 0) * 0.5), 0);
    } else {
      points = splits.reduce((sum, split) => {
        const homeRuns = Math.max(0, Number(split?.stat?.homeRuns) || 0);
        const walkOffHomeRuns = resolveWalkOffHomeRuns(split?.stat || {}, homeRuns);
        return sum + getTieredHomeRunPoints(homeRuns) + (walkOffHomeRuns * 3);
      }, 0);
    }
  } catch {
    points = 0;
  }

  requestCache.set(cacheKey, points);
  return points;
}

function advanceTurn(draft) {
  const isLastUser = draft.currentTurn === draft.users.length - 1;

  if (draft.draftType === 'snake') {
    if (draft.currentRound % 2 === 1) {
      if (isLastUser) {
        draft.currentRound++;
        draft.currentTurn = draft.users.length - 1;
      } else {
        draft.currentTurn++;
      }
    } else if (draft.currentTurn === 0) {
      draft.currentRound++;
      draft.currentTurn = 0;
    } else {
      draft.currentTurn--;
    }
  } else if (isLastUser) {
    draft.currentRound++;
    draft.currentTurn = 0;
  } else {
    draft.currentTurn++;
  }
}

function applyPickToDraft(draft, playerId, playerName, playerPosition = '', isAuto = false) {
  const currentUser = draft.users[draft.currentTurn];
  if (!currentUser) return;

  currentUser.picks.push({
    playerId,
    playerName,
    position: typeof playerPosition === 'object' ? resolveRosterPosition(playerPosition) : normalizePosition(playerPosition),
    round: draft.currentRound,
    autoPicked: isAuto
  });

  if (!draft.pickedPlayerIds.includes(playerId)) {
    draft.pickedPlayerIds.push(playerId);
  }

  advanceTurn(draft);

  if (draft.currentRound > MAX_DRAFT_ROUNDS) {
    draft.status = 'completed';
    draft.completedAt = new Date();
    draft.turnEndsAt = null;
    return;
  }

  draft.turnEndsAt = new Date(Date.now() + ((draft.pickTimeLimitSeconds || 180) * 1000));
}

async function processDraftTimeouts(draft) {
  if (!draft || draft.status !== 'active' || !draft.turnEndsAt) return draft;

  let guard = 0;
  const maxIterations = 200;

  while (draft.status === 'active' && draft.turnEndsAt && Date.now() >= new Date(draft.turnEndsAt).getTime() && guard < maxIterations) {
    guard++;

    const currentUser = draft.users?.[draft.currentTurn];
    if (!currentUser) {
      advanceTurn(draft);
      draft.turnEndsAt = new Date(Date.now() + ((draft.pickTimeLimitSeconds || 180) * 1000));
      continue;
    }

    const currentPicks = currentUser.picks || [];
    if (currentPicks.length >= ROSTER_SLOT_TEMPLATE.length) {
      // Skip turns for teams that already filled their roster.
      advanceTurn(draft);
      draft.turnEndsAt = new Date(Date.now() + ((draft.pickTimeLimitSeconds || 180) * 1000));
      continue;
    }

    const existingSlots = buildRosterSlotState();
    const currentPickIds = currentPicks
      .map((pick) => String(pick?.playerId || '').trim())
      .filter(Boolean);
    const currentPlayers = currentPickIds.length > 0
      ? await Player.find({ _id: { $in: currentPickIds } }, { _id: 1, position: 1, stats: 1, statsBySeason: 1 }).lean()
      : [];
    const currentPlayerById = new Map(currentPlayers.map((player) => [String(player._id), player]));

    for (const pick of currentPicks) {
      const persistedPosition = normalizePosition(pick?.position);
      const slotPosition = (persistedPosition && persistedPosition !== 'P')
        ? persistedPosition
        : resolveRosterPosition(currentPlayerById.get(String(pick?.playerId || '').trim()));
      if (!slotPosition) continue;
      occupySlotForPosition(existingSlots, slotPosition);
    }

    const availablePlayers = await Player.find({ _id: { $nin: draft.pickedPlayerIds || [] } })
      .sort({ homeruns: -1, strikeouts: -1, name: 1 })
      .lean();

    const nextBest = availablePlayers.find((player) => {
      if (!player) return false;
      const normalizedPosition = resolveRosterPosition(player);
      if (!normalizedPosition) return false;

      const slotSnapshot = existingSlots.map((slot) => ({ ...slot }));
      return Boolean(occupySlotForPosition(slotSnapshot, normalizedPosition));
    });

    if (!nextBest) {
      // No eligible player for this team right now (e.g., pitcher cap hit and only pitchers left).
      advanceTurn(draft);
      draft.turnEndsAt = new Date(Date.now() + ((draft.pickTimeLimitSeconds || 180) * 1000));
      continue;
    }

    applyPickToDraft(draft, String(nextBest._id), nextBest.name, nextBest, true);
  }

  return draft;
}

// GET /api/drafts/standings - Aggregate all user teams and total points
router.get('/standings', async (req, res) => {
  try {
    const groupId = String(req.query?.groupId || '').trim();
    const weekRange = getCurrentWeekRange();
    const drafts = await Draft.find(groupId ? { groupId } : {});

    const teamMap = new Map();
    for (const draft of drafts) {
      for (const user of draft.users || []) {
        if (!user || !user.picks || user.picks.length === 0) continue;

        const teamId = user.userId || `name:${user.name || 'Unknown User'}`;
        const existing = teamMap.get(teamId) || {
          teamId,
          userId: user.userId || null,
          teamName: user.name || 'Unknown User',
          totalPoints: 0,
          weeklyPoints: 0,
          totalPicks: 0
        };

        existing.totalPicks += user.picks.length;
        teamMap.set(teamId, existing);
      }
    }

    const requestCache = new Map();
    const allPlayerIds = new Set();
    const allPlayerNames = new Set();
    drafts.forEach((draft) => {
      (draft.users || []).forEach((user) => {
        (user.picks || []).forEach((pick) => {
          if (pick.playerId) allPlayerIds.add(String(pick.playerId));
          if (pick.playerName) allPlayerNames.add(String(pick.playerName).trim());
        });
      });
    });

    const playerQuery = [];
    if (allPlayerIds.size > 0) {
      playerQuery.push({ _id: { $in: [...allPlayerIds] } });
    }
    if (allPlayerNames.size > 0) {
      playerQuery.push({ name: { $in: [...allPlayerNames] } });
    }

    const players = playerQuery.length > 0
      ? await Player.find({ $or: playerQuery })
      : [];
    const playerMapById = new Map(players.map((p) => [String(p._id), p]));
    const playerMapByName = new Map();
    for (const player of players) {
      const nameKey = String(player?.name || '').trim().toLowerCase();
      if (!nameKey || playerMapByName.has(nameKey)) continue;
      playerMapByName.set(nameKey, player);
    }

    for (const draft of drafts) {
      for (const user of draft.users || []) {
        if (!user || !user.picks || user.picks.length === 0) continue;
        const teamId = user.userId || `name:${user.name || 'Unknown User'}`;
        const team = teamMap.get(teamId);
        if (!team) continue;

        for (const pick of user.picks) {
          const playerId = String(pick.playerId || '');
          const playerNameKey = String(pick.playerName || '').trim().toLowerCase();
          const player = playerMapById.get(playerId) || playerMapByName.get(playerNameKey);
          if (!player) continue;
          const season = getLatestSeasonForPlayer(player);
          const points = await getFantasyPointsForPlayerSeason(player, season, requestCache);
          const weeklyPoints = await getFantasyPointsForPlayerDateRange(player, season, weekRange.start, weekRange.end, requestCache);
          team.totalPoints += points;
          team.weeklyPoints += weeklyPoints;
        }
      }
    }

    const standings = [...teamMap.values()]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((team, index) => ({
        rank: index + 1,
        ...team
      }));

    res.json({
      standings,
      groupId: groupId || null,
      weeklyWindow: {
        startDate: formatLocalDateKey(weekRange.start),
        endDate: formatLocalDateKey(weekRange.end)
      }
    });
  } catch (err) {
    console.error('[API] standings error:', err.message);
    res.status(500).json({ message: 'Failed to compute standings' });
  }
});

// GET /api/drafts/my-team - Get all picks for the logged-in user
router.get('/my-team', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const drafts = await Draft.find({ 'users.userId': user.userId });
    const allPicks = [];

    for (const draft of drafts) {
      const slot = draft.users.find(u => u.userId === user.userId);
      if (slot) {
        allPicks.push(...slot.picks.map(p => ({ ...p.toObject(), draftName: draft.name })));
      }
    }

    res.json({ username: user.username, picks: allPicks });
  } catch (err) {
    console.error('[API] my-team error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/drafts/my-team/pickup - Add a player to logged-in user's roster in a group
router.post('/my-team/pickup', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const playerId = String(req.body?.playerId || '').trim();
    const groupId = String(req.body?.groupId || '').trim();

    if (!playerId) return res.status(400).json({ message: 'playerId is required' });
    if (!groupId) return res.status(400).json({ message: 'groupId is required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((member) => member.userId === user.userId);
    if (!isMember) {
      return res.status(403).json({ message: 'You must be in this group to pick up players' });
    }

    if (!group.draftScheduledAt) {
      return res.status(403).json({ message: 'Pickups unlock after your group draft time is set and has passed' });
    }

    const draftScheduledAtMs = new Date(group.draftScheduledAt).getTime();
    if (!Number.isFinite(draftScheduledAtMs)) {
      return res.status(400).json({ message: 'Group draft schedule is invalid. Please update the draft time.' });
    }

    if (Date.now() < draftScheduledAtMs) {
      return res.status(403).json({
        message: `Pickups unlock after ${new Date(group.draftScheduledAt).toLocaleString()}`
      });
    }

    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: 'Player not found' });

    let groupDrafts = await Draft.find({ groupId }).sort({ createdAt: -1 });
    if (groupDrafts.length === 0) {
      const users = (group.members || []).map((member) => ({
        name: member.username,
        userId: member.userId,
        picks: []
      }));

      const defaultDraftType = group.preferredDraftType === 'round-robin' ? 'round-robin' : 'snake';

      const rosterDraft = new Draft({
        name: `${group.name} Roster`,
        draftType: defaultDraftType,
        users,
        status: 'completed',
        groupId: String(group._id),
        pickedPlayerIds: []
      });

      const savedRosterDraft = await rosterDraft.save();
      groupDrafts = [savedRosterDraft];
    }

    const alreadyOwned = groupDrafts.some((draft) =>
      (draft.users || []).some((slot) =>
        (slot.picks || []).some((pick) => String(pick.playerId) === playerId)
      )
    );

    if (alreadyOwned) {
      return res.status(409).json({ message: 'Player is already on a team in this group' });
    }

    const userDraftPicks = [];
    for (const draft of groupDrafts) {
      const userSlot = (draft.users || []).find((slot) => slot.userId === user.userId);
      if (userSlot) {
        userDraftPicks.push(...(userSlot.picks || []));
      }
    }

    const rosterSlots = buildRosterSlotState();
    const existingPlayerIds = userDraftPicks
      .map((pick) => String(pick.playerId || '').trim())
      .filter(Boolean);

    const positionCountByValue = new Map();

    if (existingPlayerIds.length > 0) {
      const existingPlayers = await Player.find({ _id: { $in: existingPlayerIds } }, { _id: 1, position: 1, stats: 1, statsBySeason: 1 }).lean();
      const positionByPlayerId = new Map(existingPlayers.map((existingPlayer) => [String(existingPlayer._id), resolveRosterPosition(existingPlayer)]));

      for (const pick of userDraftPicks) {
        const pickPosition = positionByPlayerId.get(String(pick.playerId));
        if (!pickPosition) continue;

        const occupiedSlot = occupySlotForPosition(rosterSlots, pickPosition);
        if (!occupiedSlot) {
          return res.status(400).json({ message: 'Your roster is already full for available lineup slots' });
        }
      }
    }

    const requestedPosition = resolveRosterPosition(player);

    const availableSlotForRequestedPosition = occupySlotForPosition(rosterSlots, requestedPosition);
    if (!availableSlotForRequestedPosition) {
      return res.status(400).json({ message: `No available lineup slot for position ${requestedPosition || 'N/A'}` });
    }

    let targetDraft = groupDrafts.find((draft) => (draft.users || []).some((slot) => slot.userId === user.userId));
    if (!targetDraft) {
      targetDraft = groupDrafts[0];
      targetDraft.users.push({ name: user.username, userId: user.userId, picks: [] });
    }

    const targetSlot = targetDraft.users.find((slot) => slot.userId === user.userId);
    const nextRound = (targetSlot?.picks?.length || 0) + 1;

    targetSlot.picks.push({
      playerId,
      playerName: player.name,
      position: requestedPosition,
      round: nextRound,
      timestamp: new Date()
    });

    if (!Array.isArray(targetDraft.pickedPlayerIds)) {
      targetDraft.pickedPlayerIds = [];
    }

    if (!targetDraft.pickedPlayerIds.includes(playerId)) {
      targetDraft.pickedPlayerIds.push(playerId);
    }

    await targetDraft.save();

    const refreshedDrafts = await Draft.find({ groupId });
    const picks = [];
    for (const draft of refreshedDrafts) {
      const slot = (draft.users || []).find((entry) => entry.userId === user.userId);
      if (slot) {
        picks.push(...slot.picks.map((pick) => ({ ...pick.toObject(), draftId: String(draft._id), draftName: draft.name })));
      }
    }

    res.json({
      success: true,
      username: user.username,
      picks,
      groupId,
      player: { _id: String(player._id), name: player.name }
    });
  } catch (err) {
    console.error('[API] pickup-player error:', err.message);
    res.status(500).json({ message: 'Failed to pick up player' });
  }
});

// POST /api/drafts/from-group - create draft with group members as fixed participants
router.post('/from-group', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const { groupId, draftName, draftType } = req.body || {};
    if (!groupId) return res.status(400).json({ message: 'groupId is required' });

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((m) => m.userId === user.userId);
    if (!isMember) return res.status(403).json({ message: 'You must be in this group to create a group draft' });

    if (!group.draftScheduledAt) {
      return res.status(400).json({ message: 'Set a draft date/time for the group first' });
    }

    const existingGroupDraft = await Draft.findOne({
      groupId: String(group._id),
      status: { $in: ['setup', 'active'] }
    }).sort({ createdAt: -1 });

    if (existingGroupDraft) {
      return res.json(existingGroupDraft);
    }

    const orderedMemberIds = Array.isArray(group.draftOrderUserIds)
      ? group.draftOrderUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const groupMembers = Array.isArray(group.members) ? group.members : [];
    const memberById = new Map(groupMembers.map((member) => [String(member.userId), member]));

    const orderedMembers = [];
    for (const userId of orderedMemberIds) {
      const member = memberById.get(userId);
      if (member) orderedMembers.push(member);
    }
    for (const member of groupMembers) {
      if (!orderedMemberIds.includes(String(member.userId))) {
        orderedMembers.push(member);
      }
    }

    const users = orderedMembers.map((m) => ({
      name: m.username,
      userId: m.userId,
      picks: []
    }));

    const resolvedDraftType = draftType === 'round-robin' || draftType === 'snake'
      ? draftType
      : (group.preferredDraftType === 'round-robin' ? 'round-robin' : 'snake');

    const draft = new Draft({
      name: String(draftName || `${group.name} Draft`).trim(),
      draftType: resolvedDraftType,
      users,
      status: 'setup',
      groupId: String(group._id),
      scheduledStartAt: group.draftScheduledAt || null,
      pickTimeLimitSeconds: 180
    });

    const saved = await draft.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('[API] create from group error:', err.message);
    res.status(500).json({ message: 'Failed to create draft from group' });
  }
});

// POST /api/drafts/roster/swap - Swap a bench player with an active player
router.post('/roster/swap', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const { groupId, benchPlayerId, activePlayerId } = req.body || {};
    if (!groupId || !benchPlayerId) {
      return res.status(400).json({ message: 'groupId and benchPlayerId are required' });
    }
    if (activePlayerId && String(benchPlayerId) === String(activePlayerId)) {
      return res.status(400).json({ message: 'Bench player and active player must be different' });
    }

    const drafts = await Draft.find({ groupId: String(groupId) });

    let benchDraft = null;
    let benchSlot = null;
    let activeDraft = null;
    let activeSlot = null;

    for (const draft of drafts) {
      const slot = (draft.users || []).find((s) => s.userId === user.userId);
      if (!slot) continue;
      const playerIds = new Set((slot.picks || []).map((p) => String(p.playerId)));

      if (!benchSlot && playerIds.has(String(benchPlayerId))) {
        benchDraft = draft;
        benchSlot = slot;
      }
      if (activePlayerId && !activeSlot && playerIds.has(String(activePlayerId))) {
        activeDraft = draft;
        activeSlot = slot;
      }
    }

    if (!benchSlot) {
      return res.status(404).json({ message: 'Could not find selected bench player on your team in this group' });
    }
    if (activePlayerId && !activeSlot) {
      return res.status(404).json({ message: 'Could not find selected active player on your team in this group' });
    }

    const benchContext = await resolveRosterContext(benchSlot);
    const benchEffectiveIds = benchContext.effectiveBenchIds;
    const benchSet = new Set(benchEffectiveIds.map(String));

    if (!benchSet.has(String(benchPlayerId))) {
      return res.status(400).json({ message: 'Selected player is not currently on bench' });
    }

    const normalizedBenchPosition = normalizePosition(
      benchContext.positionByPlayerId.get(String(benchPlayerId)) || ''
    );

    if (!activePlayerId) {
      // Activate bench player to an open active slot for the same roster position.
      const occupiedActiveKeys = new Set(
        [...benchContext.slotByPlayerId.entries()]
          .filter(([, slotKey]) => !String(slotKey).startsWith('BN'))
          .map(([, slotKey]) => String(slotKey))
      );

      const hasOpenCompatibleActiveSlot = ROSTER_SLOT_TEMPLATE.some((slot) => {
        if (slot.isBench) return false;
        if (occupiedActiveKeys.has(String(slot.key))) return false;
        return slot.accepts.includes(normalizedBenchPosition);
      });

      if (!hasOpenCompatibleActiveSlot) {
        return res.status(400).json({ message: 'No open active slot for this bench player position' });
      }

      benchSlot.benchPlayerIds = benchEffectiveIds
        .filter((id) => String(id) !== String(benchPlayerId))
        .slice(0, MAX_BENCH_SLOTS);

      benchDraft.markModified('users');
      await benchDraft.save();

      return res.json({ message: 'Player moved from bench to active roster' });
    }

    const activeContext = await resolveRosterContext(activeSlot);
    const activeEffectiveIds = activeContext.effectiveBenchIds;
    const activeBenchSet = new Set(activeEffectiveIds.map(String));
    if (activeBenchSet.has(String(activePlayerId))) {
      return res.status(400).json({ message: 'Selected active player is already on bench' });
    }

    const activeSlotKey = activeContext.slotByPlayerId.get(String(activePlayerId)) || '';
    if (!activeSlotKey || String(activeSlotKey).startsWith('BN')) {
      return res.status(400).json({ message: 'Selected player is not currently in an active slot' });
    }

    const normalizedActivePosition = normalizePosition(
      activeContext.positionByPlayerId.get(String(activePlayerId)) || ''
    );

    const isCompatibleSwap = normalizedActivePosition === normalizedBenchPosition;

    if (!isCompatibleSwap) {
      return res.status(400).json({ message: 'Swap requires the same roster position' });
    }

    if (String(benchDraft._id) === String(activeDraft._id)) {
      // Same source slot: apply swap atomically to avoid overwrite bugs.
      const nextBenchIds = benchEffectiveIds
        .filter((id) => String(id) !== String(benchPlayerId) && String(id) !== String(activePlayerId));
      nextBenchIds.push(String(activePlayerId));
      benchSlot.benchPlayerIds = nextBenchIds.slice(0, MAX_BENCH_SLOTS);

      benchDraft.markModified('users');
      await benchDraft.save();
    } else {
      // Different source slots: update each slot independently.
      benchSlot.benchPlayerIds = benchEffectiveIds
        .filter((id) => String(id) !== String(benchPlayerId))
        .slice(0, MAX_BENCH_SLOTS);

      const nextActiveBenchIds = activeEffectiveIds.filter((id) => String(id) !== String(activePlayerId));
      nextActiveBenchIds.push(String(activePlayerId));
      activeSlot.benchPlayerIds = nextActiveBenchIds.slice(0, MAX_BENCH_SLOTS);

      benchDraft.markModified('users');
      activeDraft.markModified('users');
      await benchDraft.save();
      await activeDraft.save();
    }

    res.json({ message: 'Swap successful' });
  } catch (err) {
    console.error('[API] roster swap error:', err.message);
    res.status(500).json({ message: 'Failed to swap roster players' });
  }
});

// DELETE /api/drafts/my-team/:playerId - Drop a player from logged-in user's roster
router.delete('/my-team/:playerId', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const playerId = String(req.params.playerId || '').trim();
    if (!playerId) return res.status(400).json({ message: 'playerId is required' });

    const drafts = await Draft.find({
      'users.userId': user.userId,
      'users.picks.playerId': playerId
    });

    if (drafts.length === 0) {
      return res.status(404).json({ message: 'Player not found on your roster' });
    }

    let droppedCount = 0;

    for (const draft of drafts) {
      const userSlot = draft.users.find((u) => u.userId === user.userId);
      if (!userSlot) continue;

      const beforeCount = userSlot.picks.length;
      userSlot.picks = userSlot.picks.filter((pick) => String(pick.playerId) !== playerId);
      // Also remove from bench list if present
      userSlot.benchPlayerIds = (userSlot.benchPlayerIds || []).filter((id) => String(id) !== playerId);
      const removedHere = beforeCount - userSlot.picks.length;
      if (removedHere > 0) {
        droppedCount += removedHere;

        const stillPickedByAnyone = draft.users.some((slot) =>
          (slot.picks || []).some((pick) => String(pick.playerId) === playerId)
        );

        if (!stillPickedByAnyone) {
          draft.pickedPlayerIds = (draft.pickedPlayerIds || []).filter((id) => String(id) !== playerId);
        }

        await draft.save();
      }
    }

    const refreshedDrafts = await Draft.find({ 'users.userId': user.userId });
    const allPicks = [];
    for (const draft of refreshedDrafts) {
      const slot = draft.users.find((u) => u.userId === user.userId);
      if (slot) {
        allPicks.push(...slot.picks.map((p) => ({ ...p.toObject(), draftName: draft.name })));
      }
    }

    res.json({
      message: `Dropped ${droppedCount} player pick${droppedCount === 1 ? '' : 's'}`,
      username: user.username,
      picks: allPicks
    });
  } catch (err) {
    console.error('[API] drop-player error:', err.message);
    res.status(500).json({ message: 'Failed to drop player' });
  }
});

// PUT /api/drafts/:id/users/:userIndex/claim - Claim a draft slot as the logged-in user
router.put('/:id/users/:userIndex/claim', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });

    const idx = parseInt(req.params.userIndex);
    if (idx < 0 || idx >= draft.users.length) {
      return res.status(400).json({ message: 'Invalid user index' });
    }

    // Check slot isn't already claimed by someone else
    const existingClaim = draft.users.find((u, i) => i !== idx && u.userId === user.userId);
    if (existingClaim) {
      return res.status(409).json({ message: 'You already have a slot in this draft' });
    }

    draft.users[idx].userId = user.userId;
    draft.users[idx].name = user.username;
    await draft.save();

    res.json(draft);
  } catch (err) {
    console.error('[API] claim error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new draft
router.post('/', async (req, res) => {
  try {
    const { name, draftType, userCount } = req.body;
    
    console.log('[API] POST /api/drafts - Creating new draft');
    console.log(`[API] Name: ${name}, Type: ${draftType}, Users: ${userCount}`);

    if (!name || !draftType || !userCount) {
      return res.status(400).json({ message: 'Missing required fields: name, draftType, userCount' });
    }

    if (userCount < 1 || userCount > 10) {
      return res.status(400).json({ message: 'User count must be between 1 and 10' });
    }

    // Create users array with empty names
    const users = Array.from({ length: userCount }, (_, i) => ({
      name: `User ${i + 1}`,
      picks: []
    }));

    const draft = new Draft({
      name,
      draftType,
      users,
      status: 'setup'
    });

    const savedDraft = await draft.save();
    console.log(`[API] Draft created with ID: ${savedDraft._id}`);
    res.status(201).json(savedDraft);
  } catch (err) {
    console.error('[API] Error creating draft:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Get a draft by ID
router.get('/:id', async (req, res) => {
  try {
    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });

    await processDraftTimeouts(draft);
    await draft.save();
    
    console.log(`[API] GET /api/drafts/${req.params.id}`);
    res.json(draft);
  } catch (err) {
    console.error('[API] Error fetching draft:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Start a draft
router.post('/:id/start', async (req, res) => {
  try {
    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });

    if (draft.groupId) {
      const group = await Group.findById(draft.groupId).lean();
      const scheduledStartAt = group?.draftScheduledAt || draft.scheduledStartAt;
      if (scheduledStartAt && Date.now() < new Date(scheduledStartAt).getTime()) {
        return res.status(400).json({
          message: `This draft is scheduled for ${new Date(scheduledStartAt).toLocaleString()}`
        });
      }
    }

    draft.status = 'active';
    draft.currentTurn = 0;
    draft.currentRound = 1;
    draft.turnEndsAt = new Date(Date.now() + ((draft.pickTimeLimitSeconds || 180) * 1000));
    
    const updated = await draft.save();
    console.log(`[API] Draft ${req.params.id} started`);
    res.json(updated);
  } catch (err) {
    console.error('[API] Error starting draft:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Update user name
router.put('/:id/users/:userIndex/name', async (req, res) => {
  try {
    const { name } = req.body;
    const draft = await Draft.findById(req.params.id);
    
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    if (req.params.userIndex >= draft.users.length) {
      return res.status(400).json({ message: 'Invalid user index' });
    }

    draft.users[req.params.userIndex].name = name;
    const updated = await draft.save();
    res.json(updated);
  } catch (err) {
    console.error('[API] Error updating user name:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// Make a pick
router.post('/:id/pick', async (req, res) => {
  try {
    const user = getUser(req);
    const { playerId, playerName } = req.body;
    const draft = await Draft.findById(req.params.id);
    
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    if (draft.status !== 'active') return res.status(400).json({ message: 'Draft is not active' });
    if (draft.currentRound > MAX_DRAFT_ROUNDS) {
      draft.status = 'completed';
      draft.completedAt = new Date();
      draft.turnEndsAt = null;
      const updatedDraft = await draft.save();
      return res.status(409).json({
        message: `Draft has reached the ${MAX_DRAFT_ROUNDS}-round limit and is now completed`,
        draft: updatedDraft
      });
    }

    await processDraftTimeouts(draft);

    if (draft.status !== 'active') {
      const updatedDraft = await draft.save();
      return res.status(409).json({
        message: `Draft has reached the ${MAX_DRAFT_ROUNDS}-round limit and is now completed`,
        draft: updatedDraft
      });
    }

    if (draft.pickedPlayerIds.includes(playerId)) {
      return res.status(400).json({ message: 'Player already picked' });
    }

    const pickedPlayer = await Player.findById(playerId).lean();
    if (!pickedPlayer) {
      return res.status(404).json({ message: 'Player not found' });
    }

    const currentTurnUser = draft.users?.[draft.currentTurn];
    if (!currentTurnUser) {
      return res.status(400).json({ message: 'Current draft turn is invalid' });
    }

    const currentTurnPicks = currentTurnUser.picks || [];
    if (currentTurnPicks.length >= ROSTER_SLOT_TEMPLATE.length) {
      return res.status(400).json({ message: `This team roster is full (${ROSTER_SLOT_TEMPLATE.length}/${ROSTER_SLOT_TEMPLATE.length} spots filled)` });
    }

    const rosterSlots = buildRosterSlotState();
    const currentPickIds = currentTurnPicks
      .map((pick) => String(pick?.playerId || '').trim())
      .filter(Boolean);
    const currentPlayers = currentPickIds.length > 0
      ? await Player.find({ _id: { $in: currentPickIds } }, { _id: 1, position: 1, stats: 1, statsBySeason: 1 }).lean()
      : [];
    const playerById = new Map(currentPlayers.map((player) => [String(player._id), player]));

    for (const pick of currentTurnPicks) {
      const persistedPosition = normalizePosition(pick?.position);
      const slotPosition = (persistedPosition && persistedPosition !== 'P')
        ? persistedPosition
        : resolveRosterPosition(playerById.get(String(pick?.playerId || '').trim()));
      if (!slotPosition) continue;
      occupySlotForPosition(rosterSlots, slotPosition);
    }

    const pickedPlayerPosition = resolveRosterPosition(pickedPlayer);
    if (!occupySlotForPosition(rosterSlots, pickedPlayerPosition)) {
      return res.status(400).json({ message: `No available lineup slot for position ${pickedPlayerPosition || 'N/A'}` });
    }

    // Enforce 15-slot roster cap per user
    if (user) {
      const MAX_ROSTER_SIZE = ROSTER_SLOT_TEMPLATE.length;
      const userSlot = draft.users.find((u) => u.userId === user.userId);
      if (userSlot && (userSlot.picks || []).length >= MAX_ROSTER_SIZE) {
        return res.status(400).json({ message: `Your roster is full (${MAX_ROSTER_SIZE}/${MAX_ROSTER_SIZE} spots filled)` });
      }
    }

    applyPickToDraft(draft, playerId, playerName || pickedPlayer.name, pickedPlayer, false);

    const updated = await draft.save();
    console.log(`[API] Pick made for draft ${req.params.id}`);
    res.json(updated);
  } catch (err) {
    console.error('[API] Error making pick:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// End draft
router.post('/:id/end', async (req, res) => {
  try {
    const requester = getUser(req);
    if (!requester) return res.status(401).json({ message: 'Not logged in' });

    const draft = await Draft.findById(req.params.id);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });

    let canOwnerForceEnd = false;
    if (draft.groupId) {
      const group = await Group.findById(draft.groupId).lean();
      if (!group) return res.status(404).json({ message: 'Group not found' });
      if (group.ownerUserId !== requester.userId) {
        return res.status(403).json({ message: 'Only the group owner can end this draft' });
      }
      canOwnerForceEnd = true;
    }

    if (!canOwnerForceEnd) {
      for (const user of draft.users || []) {
        const userPicks = user?.picks || [];
        if (userPicks.length < ROSTER_SLOT_TEMPLATE.length) {
          return res.status(400).json({
            message: `Cannot end draft: ${user?.name || 'A team'} has only ${userPicks.length}/${ROSTER_SLOT_TEMPLATE.length} players`
          });
        }

        const rosterProgressState = await buildRosterProgressState(userPicks);
        if (!rosterProgressState.isComplete) {
          return res.status(400).json({
            message: `Cannot end draft: ${user?.name || 'A team'} must fill all starting positions and 3 bench spots`
          });
        }
      }
    }

    draft.status = 'completed';
    draft.completedAt = new Date();
    
    const updated = await draft.save();
    console.log(`[API] Draft ${req.params.id} completed`);
    res.json(updated);
  } catch (err) {
    console.error('[API] Error ending draft:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
