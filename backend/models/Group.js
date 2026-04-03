const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },
  ownerUserId: {
    type: String,
    required: true
  },
  inviteCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  draftScheduledAt: {
    type: Date,
    default: null
  },
  preferredDraftType: {
    type: String,
    enum: ['snake', 'round-robin'],
    default: 'snake'
  },
  members: [{
    userId: { type: String, required: true },
    username: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now }
  }],
  draftOrderUserIds: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Group', groupSchema);
