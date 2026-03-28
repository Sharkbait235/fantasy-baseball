const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  team: {
    type: String,
    required: true
  },
  position: {
    type: String,
    required: true
  },
  homeruns: {
    type: Number,
    default: 0
  },
  strikeouts: {
    type: Number,
    default: 0
  },
  photoUrl: {
    type: String,
    default: ''
  },
  mlbPlayerId: {
    type: Number,
    default: null
  },
  stats: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  statsBySeason: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Player', playerSchema);
