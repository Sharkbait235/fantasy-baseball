const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Group = require('../models/Group');
const Draft = require('../models/Draft');
const Trade = require('../models/Trade');

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

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function createUniqueInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const existing = await Group.findOne({ inviteCode: code });
    if (!existing) return code;
  }
  return `${generateInviteCode()}${Math.floor(Math.random() * 10)}`;
}

function parseDraftScheduledAt(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'Draft date/time is invalid' };
  }

  if (parsed.getTime() < (Date.now() - 60000)) {
    return { error: 'Draft date/time must be in the future' };
  }

  return { value: parsed };
}

function parsePreferredDraftType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return { value: 'snake' };
  if (normalized === 'snake' || normalized === 'round-robin') {
    return { value: normalized };
  }
  return { error: 'Draft type must be snake or round-robin' };
}

// GET /api/groups - all groups for current user
router.get('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const groups = await Group.find({ 'members.userId': user.userId }).sort({ createdAt: -1 });
    res.json({ groups });
  } catch (err) {
    console.error('[GROUPS] list error:', err.message);
    res.status(500).json({ message: 'Failed to load groups' });
  }
});

// GET /api/groups/:id/teams - all member teams scoped to a group
router.get('/:id/teams', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const isMember = group.members.some((member) => member.userId === user.userId);
    if (!isMember) {
      return res.status(403).json({ message: 'You must be in this group to view its teams' });
    }

    const drafts = await Draft.find({ groupId: String(group._id) }).sort({ createdAt: -1 });

    const teams = group.members.map((member) => {
      const picks = [];
      const benchPlayerIds = [];

      for (const draft of drafts) {
        const slot = (draft.users || []).find((entry) => entry.userId === member.userId);
        if (!slot) continue;

        picks.push(...(slot.picks || []).map((pick) => ({
          ...pick.toObject(),
          draftId: String(draft._id),
          draftName: draft.name
        })));

        (slot.benchPlayerIds || []).forEach((id) => {
          if (!benchPlayerIds.includes(String(id))) benchPlayerIds.push(String(id));
        });
      }

      return {
        userId: member.userId,
        username: member.username,
        picks,
        benchPlayerIds
      };
    });

    res.json({
      group: {
        _id: String(group._id),
        name: group.name,
        inviteCode: group.inviteCode
      },
      teams
    });
  } catch (err) {
    console.error('[GROUPS] teams error:', err.message);
    res.status(500).json({ message: 'Failed to load group teams' });
  }
});

// POST /api/groups - create group
router.post('/', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Group name is required' });

    const parsedDraftSchedule = parseDraftScheduledAt(req.body?.draftScheduledAt);
    if (parsedDraftSchedule.error) {
      return res.status(400).json({ message: parsedDraftSchedule.error });
    }

    const parsedDraftType = parsePreferredDraftType(req.body?.preferredDraftType);
    if (parsedDraftType.error) {
      return res.status(400).json({ message: parsedDraftType.error });
    }

    const inviteCode = await createUniqueInviteCode();

    const group = new Group({
      name,
      ownerUserId: user.userId,
      inviteCode,
      draftScheduledAt: parsedDraftSchedule.value,
      preferredDraftType: parsedDraftType.value,
      members: [{ userId: user.userId, username: user.username }],
      draftOrderUserIds: [user.userId]
    });

    await group.save();
    res.status(201).json(group);
  } catch (err) {
    console.error('[GROUPS] create error:', err.message);
    res.status(500).json({ message: 'Failed to create group' });
  }
});

// PUT /api/groups/:id/draft-schedule - set/clear group draft date-time (owner only)
router.put('/:id/draft-schedule', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.ownerUserId !== user.userId) {
      return res.status(403).json({ message: 'Only the group owner can set the draft schedule' });
    }

    const parsedDraftSchedule = parseDraftScheduledAt(req.body?.draftScheduledAt);
    if (parsedDraftSchedule.error) {
      return res.status(400).json({ message: parsedDraftSchedule.error });
    }

    group.draftScheduledAt = parsedDraftSchedule.value;
    await group.save();
    res.json(group);
  } catch (err) {
    console.error('[GROUPS] set draft schedule error:', err.message);
    res.status(500).json({ message: 'Failed to update draft schedule' });
  }
});

// POST /api/groups/join - join group by invite code
router.post('/join', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const inviteCode = String(req.body?.inviteCode || '').trim().toUpperCase();
    if (!inviteCode) return res.status(400).json({ message: 'Invite code is required' });

    const group = await Group.findOne({ inviteCode });
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const alreadyInGroup = group.members.some((m) => m.userId === user.userId);
    if (!alreadyInGroup) {
      group.members.push({ userId: user.userId, username: user.username });
      if (!Array.isArray(group.draftOrderUserIds)) {
        group.draftOrderUserIds = [];
      }
      if (!group.draftOrderUserIds.includes(user.userId)) {
        group.draftOrderUserIds.push(user.userId);
      }
      await group.save();
    }

    res.json(group);
  } catch (err) {
    console.error('[GROUPS] join error:', err.message);
    res.status(500).json({ message: 'Failed to join group' });
  }
});

// PUT /api/groups/:id/draft-order - update group draft order (owner only)
router.put('/:id/draft-order', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.ownerUserId !== user.userId) {
      return res.status(403).json({ message: 'Only the group owner can change draft order' });
    }

    const requestedOrder = Array.isArray(req.body?.draftOrderUserIds)
      ? req.body.draftOrderUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : null;

    if (!requestedOrder || requestedOrder.length === 0) {
      return res.status(400).json({ message: 'draftOrderUserIds is required' });
    }

    const memberIds = (group.members || []).map((member) => String(member.userId));
    const memberIdSet = new Set(memberIds);
    const requestedSet = new Set(requestedOrder);

    if (requestedOrder.length !== memberIds.length || requestedSet.size !== memberIds.length) {
      return res.status(400).json({ message: 'Draft order must include each group member exactly once' });
    }

    const hasInvalidMember = requestedOrder.some((userId) => !memberIdSet.has(userId));
    if (hasInvalidMember) {
      return res.status(400).json({ message: 'Draft order contains a user who is not in the group' });
    }

    const memberById = new Map((group.members || []).map((member) => [String(member.userId), member]));
    group.members = requestedOrder
      .map((userId) => memberById.get(userId))
      .filter(Boolean);
    group.draftOrderUserIds = requestedOrder;
    await group.save();

    const groupId = String(group._id);
    const setupDrafts = await Draft.find({ groupId, status: 'setup' });
    for (const draft of setupDrafts) {
      const draftUserById = new Map((draft.users || []).map((slot) => [String(slot.userId || ''), slot]));
      const reorderedUsers = requestedOrder
        .map((userId) => draftUserById.get(userId))
        .filter(Boolean);

      for (const slot of draft.users || []) {
        const slotUserId = String(slot.userId || '');
        if (!requestedSet.has(slotUserId)) {
          reorderedUsers.push(slot);
        }
      }

      draft.users = reorderedUsers;
      draft.markModified('users');
      await draft.save();
    }

    res.json(group);
  } catch (err) {
    console.error('[GROUPS] update draft order error:', err.message);
    res.status(500).json({ message: 'Failed to update draft order' });
  }
});

// PUT /api/groups/:id/team-name - update current user's team name within a group
router.put('/:id/team-name', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const teamName = String(req.body?.teamName || '').trim();
    if (!teamName) return res.status(400).json({ message: 'Team name is required' });
    if (teamName.length > 60) return res.status(400).json({ message: 'Team name must be 60 characters or fewer' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const member = group.members.find((m) => m.userId === user.userId);
    if (!member) {
      return res.status(403).json({ message: 'You must be in this group to update a team name' });
    }

    member.username = teamName;
    await group.save();

    const groupId = String(group._id);

    // Keep draft roster names in sync for standings/trades/team views.
    await Draft.updateMany(
      { groupId, 'users.userId': user.userId },
      { $set: { 'users.$[slot].name': teamName } },
      { arrayFilters: [{ 'slot.userId': user.userId }] }
    );

    // Update stored names in trade records for this group.
    await Promise.all([
      Trade.updateMany({ groupId, fromUserId: user.userId }, { $set: { fromUsername: teamName } }),
      Trade.updateMany({ groupId, toUserId: user.userId }, { $set: { toUsername: teamName } })
    ]);

    res.json({ success: true, groupId, teamName });
  } catch (err) {
    console.error('[GROUPS] update team name error:', err.message);
    res.status(500).json({ message: 'Failed to update team name' });
  }
});

// PUT /api/groups/:id - rename group (owner only)
router.put('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Group name is required' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.ownerUserId !== user.userId) {
      return res.status(403).json({ message: 'Only the group owner can rename this group' });
    }

    group.name = name;
    await group.save();
    res.json(group);
  } catch (err) {
    console.error('[GROUPS] rename error:', err.message);
    res.status(500).json({ message: 'Failed to rename group' });
  }
});

// DELETE /api/groups/:id - delete group (owner only)
router.delete('/:id', async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ message: 'Not logged in' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (group.ownerUserId !== user.userId) {
      return res.status(403).json({ message: 'Only the group owner can delete this group' });
    }

    await Group.findByIdAndDelete(group._id);
    res.json({ success: true, groupId: group._id });
  } catch (err) {
    console.error('[GROUPS] delete error:', err.message);
    res.status(500).json({ message: 'Failed to delete group' });
  }
});

module.exports = router;
