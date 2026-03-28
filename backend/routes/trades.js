const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Draft = require('../models/Draft');
const Player = require('../models/Player');
const Trade = require('../models/Trade');
const Group = require('../models/Group');

const JWT_SECRET = process.env.JWT_SECRET || 'baseball_app_secret_key';

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

function pickToPlayerMap(drafts) {
  const playerOwnerMap = new Map();
  const teamMap = new Map();

  for (const draft of drafts) {
    for (const userSlot of draft.users || []) {
      if (!userSlot?.userId) continue;

      const currentTeam = teamMap.get(userSlot.userId) || {
        userId: userSlot.userId,
        username: userSlot.name || 'Unknown User',
        players: []
      };

      for (const pick of userSlot.picks || []) {
        if (!pick?.playerId) continue;

        if (!playerOwnerMap.has(pick.playerId)) {
          playerOwnerMap.set(pick.playerId, {
            userId: userSlot.userId,
            username: userSlot.name || 'Unknown User',
            playerId: pick.playerId,
            playerName: pick.playerName,
            timestamp: pick.timestamp ? new Date(pick.timestamp).getTime() : 0
          });
        } else {
          const existing = playerOwnerMap.get(pick.playerId);
          const nextTs = pick.timestamp ? new Date(pick.timestamp).getTime() : 0;
          if (nextTs >= existing.timestamp) {
            playerOwnerMap.set(pick.playerId, {
              userId: userSlot.userId,
              username: userSlot.name || 'Unknown User',
              playerId: pick.playerId,
              playerName: pick.playerName,
              timestamp: nextTs
            });
          }
        }
      }

      teamMap.set(userSlot.userId, currentTeam);
    }
  }

  const grouped = new Map();
  for (const owned of playerOwnerMap.values()) {
    const currentTeam = grouped.get(owned.userId) || {
      userId: owned.userId,
      username: owned.username,
      players: []
    };

    currentTeam.players.push({
      playerId: owned.playerId,
      playerName: owned.playerName
    });

    grouped.set(owned.userId, currentTeam);
  }

  return {
    playerOwnerMap,
    teams: [...grouped.values()].map((team) => ({
      ...team,
      players: team.players.sort((a, b) => a.playerName.localeCompare(b.playerName))
    }))
  };
}

async function enrichTeamPlayers(teams) {
  const allPlayerIds = teams.flatMap((team) => team.players.map((p) => p.playerId));
  const players = await Player.find({ _id: { $in: allPlayerIds } });
  const playerMap = new Map(players.map((p) => [String(p._id), p]));

  return teams.map((team) => ({
    ...team,
    players: team.players.map((p) => {
      const player = playerMap.get(String(p.playerId));
      return {
        ...p,
        team: player?.team || '',
        position: player?.position || '',
        photoUrl: player?.photoUrl || ''
      };
    })
  }));
}

// GET /api/trades/teams - Current user's team + other teams for trading
router.get('/teams', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const groupId = String(req.query?.groupId || '').trim();
    let relatedDrafts;

    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group) return res.status(404).json({ message: 'Group not found' });
      const isMember = group.members.some((member) => member.userId === user.userId);
      if (!isMember) return res.status(403).json({ message: 'You must be in this group to trade here' });
      relatedDrafts = await Draft.find({ groupId });
    } else {
      relatedDrafts = await Draft.find({ 'users.userId': user.userId });
    }

    const { teams } = pickToPlayerMap(relatedDrafts);
    const enriched = await enrichTeamPlayers(teams);

    const myTeam = enriched.find((team) => team.userId === user.userId) || {
      userId: user.userId,
      username: user.username,
      players: []
    };

    const otherTeams = enriched.filter((team) => team.userId !== user.userId);

    res.json({ myTeam, otherTeams, groupId: groupId || null });
  } catch (err) {
    console.error('[TRADES] teams error:', err.message);
    res.status(500).json({ message: 'Failed to load teams for trading' });
  }
});

// GET /api/trades/inbox - Incoming offers and sent trade updates
router.get('/inbox', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const groupId = String(req.query?.groupId || '').trim();
    const groupFilter = groupId ? { groupId } : {};

    const incomingOffers = await Trade.find({ toUserId: user.userId, status: 'pending', ...groupFilter }).sort({ createdAt: -1 });
    const sentUpdates = await Trade.find({
      fromUserId: user.userId,
      status: { $in: ['accepted', 'declined'] },
      ...groupFilter
    }).sort({ respondedAt: -1, createdAt: -1 });
    const sentPending = await Trade.find({ fromUserId: user.userId, status: 'pending', ...groupFilter }).sort({ createdAt: -1 });

    res.json({
      incomingOffers,
      sentUpdates,
      sentPending
    });
  } catch (err) {
    console.error('[TRADES] inbox error:', err.message);
    res.status(500).json({ message: 'Failed to load inbox' });
  }
});

// POST /api/trades/inbox/read - mark inbox items as read for current user
router.post('/inbox/read', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const now = new Date();
    const groupId = String(req.query?.groupId || '').trim();
    const groupFilter = groupId ? { groupId } : {};

    const [incomingResult, updatesResult] = await Promise.all([
      Trade.updateMany(
        { toUserId: user.userId, status: 'pending', recipientReadAt: null, ...groupFilter },
        { $set: { recipientReadAt: now } }
      ),
      Trade.updateMany(
        {
          fromUserId: user.userId,
          status: { $in: ['accepted', 'declined'] },
          senderUpdateReadAt: null,
          ...groupFilter
        },
        { $set: { senderUpdateReadAt: now } }
      )
    ]);

    res.json({
      success: true,
      incomingMarkedRead: incomingResult.modifiedCount || 0,
      updatesMarkedRead: updatesResult.modifiedCount || 0
    });
  } catch (err) {
    console.error('[TRADES] mark read error:', err.message);
    res.status(500).json({ message: 'Failed to mark inbox as read' });
  }
});

// POST /api/trades/offers - Create a new trade offer
router.post('/offers', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const { toUserId, offeredPlayerId, requestedPlayerId, offeredPlayerIds, requestedPlayerIds, message, groupId } = req.body;

    const normalizeIds = (many, single) => {
      if (Array.isArray(many) && many.length > 0) {
        return [...new Set(many.map((id) => String(id || '').trim()).filter(Boolean))];
      }
      if (single) return [String(single).trim()];
      return [];
    };

    const normalizedOfferedIds = normalizeIds(offeredPlayerIds, offeredPlayerId);
    const normalizedRequestedIds = normalizeIds(requestedPlayerIds, requestedPlayerId);

    if (!toUserId || normalizedOfferedIds.length === 0 || normalizedRequestedIds.length === 0) {
      return res.status(400).json({ message: 'toUserId, offered players, and requested players are required' });
    }

    if (normalizedOfferedIds.length !== normalizedRequestedIds.length) {
      return res.status(400).json({ message: 'Trades must include the same number of offered and requested players' });
    }

    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) {
      return res.status(400).json({ message: 'groupId is required for trades' });
    }

    if (toUserId === user.userId) {
      return res.status(400).json({ message: 'You cannot trade with yourself' });
    }

    const group = await Group.findById(normalizedGroupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const bothInGroup = [user.userId, toUserId].every((userId) => group.members.some((member) => member.userId === userId));
    if (!bothInGroup) {
      return res.status(403).json({ message: 'Both users must be in the selected group to trade' });
    }

    const drafts = await Draft.find({ groupId: normalizedGroupId, 'users.userId': { $in: [user.userId, toUserId] } });
    const { playerOwnerMap, teams } = pickToPlayerMap(drafts);

    const offeredPlayers = [];
    for (const id of normalizedOfferedIds) {
      const ownership = playerOwnerMap.get(String(id));
      if (!ownership || ownership.userId !== user.userId) {
        return res.status(400).json({ message: 'You do not currently own one or more offered players' });
      }
      offeredPlayers.push({ playerId: String(id), playerName: ownership.playerName });
    }

    const requestedPlayers = [];
    for (const id of normalizedRequestedIds) {
      const ownership = playerOwnerMap.get(String(id));
      if (!ownership || ownership.userId !== toUserId) {
        return res.status(400).json({ message: 'The target user does not currently own one or more requested players' });
      }
      requestedPlayers.push({ playerId: String(id), playerName: ownership.playerName });
    }

    const targetTeam = teams.find((team) => team.userId === toUserId);
    if (!targetTeam) {
      return res.status(400).json({ message: 'Target user not found in tradeable teams' });
    }

    const trade = new Trade({
      groupId: normalizedGroupId,
      fromUserId: user.userId,
      fromUsername: user.username,
      toUserId,
      toUsername: targetTeam.username,
      offeredPlayerId: offeredPlayers[0].playerId,
      offeredPlayerName: offeredPlayers.map((p) => p.playerName).join(', '),
      offeredPlayers,
      requestedPlayerId: requestedPlayers[0].playerId,
      requestedPlayerName: requestedPlayers.map((p) => p.playerName).join(', '),
      requestedPlayers,
      message: String(message || '').slice(0, 500)
    });

    const saved = await trade.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('[TRADES] create offer error:', err.message);
    res.status(500).json({ message: 'Failed to create trade offer' });
  }
});

// POST /api/trades/:id/respond - Accept or decline an incoming trade offer
router.post('/:id/respond', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const { action } = req.body;
    if (!['accepted', 'declined'].includes(action)) {
      return res.status(400).json({ message: "action must be 'accepted' or 'declined'" });
    }

    const trade = await Trade.findById(req.params.id);
    if (!trade) return res.status(404).json({ message: 'Trade not found' });

    if (trade.toUserId !== user.userId) {
      return res.status(403).json({ message: 'Only the recipient can respond to this trade' });
    }

    if (trade.status !== 'pending') {
      return res.status(400).json({ message: 'Trade is no longer pending' });
    }

    if (action === 'declined') {
      trade.status = 'declined';
      trade.respondedAt = new Date();
      trade.senderUpdateReadAt = null;
      await trade.save();
      return res.json(trade);
    }

    // Re-validate ownership before finalizing accepted trade
    const involvedDrafts = await Draft.find({
      ...(trade.groupId ? { groupId: trade.groupId } : {}),
      'users.userId': { $in: [trade.fromUserId, trade.toUserId] }
    });
    const { playerOwnerMap } = pickToPlayerMap(involvedDrafts);

    const offeredPlayers = Array.isArray(trade.offeredPlayers) && trade.offeredPlayers.length > 0
      ? trade.offeredPlayers.map((p) => ({ playerId: String(p.playerId), playerName: p.playerName }))
      : [{ playerId: String(trade.offeredPlayerId), playerName: trade.offeredPlayerName }];
    const requestedPlayers = Array.isArray(trade.requestedPlayers) && trade.requestedPlayers.length > 0
      ? trade.requestedPlayers.map((p) => ({ playerId: String(p.playerId), playerName: p.playerName }))
      : [{ playerId: String(trade.requestedPlayerId), playerName: trade.requestedPlayerName }];

    if (offeredPlayers.length !== requestedPlayers.length) {
      return res.status(409).json({ message: 'Trade cannot be completed because offered/requested player counts differ' });
    }

    const offeredIds = offeredPlayers.map((p) => String(p.playerId));
    const requestedIds = requestedPlayers.map((p) => String(p.playerId));

    const allValidOwners = offeredIds.every((id) => playerOwnerMap.get(id)?.userId === trade.fromUserId)
      && requestedIds.every((id) => playerOwnerMap.get(id)?.userId === trade.toUserId);

    if (!allValidOwners) {
      return res.status(409).json({ message: 'Trade cannot be completed because ownership changed' });
    }

    const playerDocs = await Player.find({ _id: { $in: [...offeredIds, ...requestedIds] } });
    const playerNameMap = new Map(playerDocs.map((p) => [String(p._id), p.name]));

    const offeredToRequested = new Map();
    const requestedToOffered = new Map();
    for (let i = 0; i < offeredPlayers.length; i++) {
      const offeredId = offeredIds[i];
      const requestedId = requestedIds[i];
      offeredToRequested.set(offeredId, {
        playerId: requestedId,
        playerName: playerNameMap.get(requestedId) || requestedPlayers[i].playerName
      });
      requestedToOffered.set(requestedId, {
        playerId: offeredId,
        playerName: playerNameMap.get(offeredId) || offeredPlayers[i].playerName
      });
    }

    for (const draft of involvedDrafts) {
      for (const userSlot of draft.users || []) {
        if (![trade.fromUserId, trade.toUserId].includes(userSlot.userId)) continue;

        for (const pick of userSlot.picks || []) {
          const currentId = String(pick.playerId);
          if (userSlot.userId === trade.fromUserId && offeredToRequested.has(currentId)) {
            const replacement = offeredToRequested.get(currentId);
            pick.playerId = replacement.playerId;
            pick.playerName = replacement.playerName;
          } else if (userSlot.userId === trade.toUserId && requestedToOffered.has(currentId)) {
            const replacement = requestedToOffered.get(currentId);
            pick.playerId = replacement.playerId;
            pick.playerName = replacement.playerName;
          }
        }
      }
      await draft.save();
    }

    trade.status = 'accepted';
    trade.respondedAt = new Date();
    trade.senderUpdateReadAt = null;
    await trade.save();

    res.json(trade);
  } catch (err) {
    console.error('[TRADES] respond error:', err.message);
    res.status(500).json({ message: 'Failed to respond to trade' });
  }
});

module.exports = router;
