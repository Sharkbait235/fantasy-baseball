const mongoose = require('mongoose');
require('dotenv').config();
const Player = require('./models/Player');

async function checkDatabase() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');

    const count = await Player.countDocuments();
    console.log(`Total players in database: ${count}\n`);

    if (count > 0) {
      console.log('First 5 players:');
      const players = await Player.find().limit(5);
      players.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} - ${p.homeruns} HR (${p.team})`);
      });
    } else {
      console.log('⚠ No players found in database');
    }

    await mongoose.connection.close();
    console.log('\n✓ Connection closed');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkDatabase();
