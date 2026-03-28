const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection with proper configuration
const connectDB = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });
    console.log('✓ MongoDB connected successfully');
    return true;
  } catch (err) {
    console.error('✗ MongoDB connection error:', err.message);
    return false;
  }
};

// Import routes
const playerRoutes = require('./routes/players');
const draftRoutes = require('./routes/drafts');
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const groupRoutes = require('./routes/groups');

// Use routes
app.use('/api/players', playerRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/groups', groupRoutes);

// Basic health check
app.get('/api/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.json({ 
    status: 'Backend is running',
    database: dbConnected ? 'connected' : 'disconnected'
  });
});

const PORT = process.env.PORT || 3001;

// Start server only after DB connection
const startServer = async () => {
  const connected = await connectDB();
  
  if (!connected) {
    console.error('Failed to connect to MongoDB. Retrying in 5 seconds...');
    setTimeout(startServer, 5000);
    return;
  }

  app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
  });
};

startServer();
