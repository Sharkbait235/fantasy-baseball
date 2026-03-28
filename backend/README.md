# Baseball Backend API

Node.js/Express API for managing baseball players and their statistics using SportsData.io real-time data.

## Prerequisites

- Node.js (v14+)
- MongoDB (running on localhost:27017)
- npm or yarn
- SportsData.io API key (get one at https://www.sportsdata.io/)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure MongoDB is running:
   ```bash
   # On macOS with Homebrew:
   brew services start mongodb-community
   
   # Or run directly:
   mongod
   ```

3. Add your SportsData.io API key to `.env`:
   ```
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/baseball
   NODE_ENV=development
   SPORTSDATA_API_KEY=your_api_key_here
   ```

4. Seed the database with real player data from SportsData.io:
   ```bash
   npm run seed
   ```

   This will fetch all active MLB players with home run statistics and populate your database.

## Running the Server

Start the server in production mode:
```bash
npm start
```

For development with auto-reload (requires nodemon):
```bash
npm run dev
```

The server will start on http://localhost:3001

## API Endpoints

### Get all active players (sorted by home runs)
```
GET /api/players
```

Response:
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Aaron Judge",
    "team": "NEY",
    "position": "OF",
    "homeruns": 62,
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  ...
]
```

### Get a specific player
```
GET /api/players/:id
```

### Create a new player
```
POST /api/players
Content-Type: application/json

{
  "name": "New Player",
  "team": "Team Name",
  "position": "Position",
  "homeruns": 0,
  "isActive": true
}
```

### Update a player
```
PUT /api/players/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "homeruns": 50
}
```

### Delete a player
```
DELETE /api/players/:id
```

### Health check
```
GET /api/health
```

## Database Schema

**Player Model:**
- `name` (String, required) - Player's full name
- `team` (String, required) - Team abbreviation or name
- `position` (String, required) - Playing position
- `homeruns` (Number, default: 0) - Total home runs from SportsData.io
- `isActive` (Boolean, default: true) - Active status
- `createdAt` (Date, auto) - Creation timestamp

## Environment Variables

The `.env` file contains:
```
PORT=3001
MONGODB_URI=mongodb://localhost:27017/baseball
NODE_ENV=development
SPORTSDATA_API_KEY=your_api_key_here
```

**Note:** Keep your `.env` file private and never commit it to version control.

## Data Source

This application uses **SportsData.io** to fetch real-time MLB player statistics including:
- Active player status
- Home run counts
- Team assignments
- Player positions

Data is synced when you run `npm run seed`. To refresh with latest stats, run the seed command again.

## Frontend Integration

The React frontend is configured to fetch from `http://localhost:3001/api/players` and displays all active players in a table with their home run counts, sorted by highest home runs first.

## Troubleshooting

**MongoDB won't connect:**
- Ensure MongoDB is running: `brew services start mongodb-community`
- Check the MONGODB_URI in `backend/.env`

**SportsData.io API Error (401 Unauthorized):**
- Verify your API key is correct in `.env`
- Get a new API key from https://www.sportsdata.io/
- Ensure you have an active subscription plan

**No players were seeded:**
- Check that your API key is valid
- Run the seed command with verbose output: `node seed.js`
- Verify internet connection to SportsData.io

**Frontend can't reach backend:**
- Ensure backend is running on port 3001
- Check that CORS is enabled (it should be by default)

**Port already in use:**
- Backend: Change PORT in `backend/.env`
- Frontend: Use `PORT=3001 npm start` to change frontend port

