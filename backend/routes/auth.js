const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'baseball_app_secret_key';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    const user = new User({ username: username.trim(), password });
    await user.save();

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, username: user.username, userId: user._id });
  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const valid = await user.comparePassword(password);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, username: user.username, userId: user._id });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
