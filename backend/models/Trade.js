const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
  groupId: {
    type: String,
    default: null
  },
  fromUserId: {
    type: String,
    required: true
  },
  fromUsername: {
    type: String,
    required: true
  },
  toUserId: {
    type: String,
    required: true
  },
  toUsername: {
    type: String,
    required: true
  },
  offeredPlayerId: {
    type: String,
    required: true
  },
  offeredPlayerName: {
    type: String,
    required: true
  },
  offeredPlayers: {
    type: [
      {
        playerId: { type: String, required: true },
        playerName: { type: String, required: true }
      }
    ],
    default: []
  },
  requestedPlayerId: {
    type: String,
    required: true
  },
  requestedPlayerName: {
    type: String,
    required: true
  },
  requestedPlayers: {
    type: [
      {
        playerId: { type: String, required: true },
        playerName: { type: String, required: true }
      }
    ],
    default: []
  },
  message: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    default: 'pending'
  },
  respondedAt: {
    type: Date,
    default: null
  },
  recipientReadAt: {
    type: Date,
    default: null
  },
  senderUpdateReadAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Trade', tradeSchema);
