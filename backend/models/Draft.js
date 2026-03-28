const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  draftType: {
    type: String,
    enum: ['snake', 'round-robin'],
    default: 'snake'
  },
  users: [{
    name: String,
    userId: { type: String, default: null },
    picks: [{
      playerId: String,
      playerName: String,
      position: String,
      round: Number,
      timestamp: { type: Date, default: Date.now }
    }],
    benchPlayerIds: { type: [String], default: [] }
  }],
  currentTurn: {
    type: Number,
    default: 0
  },
  currentRound: {
    type: Number,
    default: 1
  },
  pickedPlayerIds: [String],
  groupId: {
    type: String,
    default: null
  },
  pickTimeLimitSeconds: {
    type: Number,
    default: 180
  },
  scheduledStartAt: {
    type: Date,
    default: null
  },
  turnEndsAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['setup', 'active', 'completed'],
    default: 'setup'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date
});

module.exports = mongoose.model('Draft', draftSchema);
