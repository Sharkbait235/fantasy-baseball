# Baseball Application

A full-stack application for displaying active baseball players and their home run statistics.

## Project Structure

```
baseball/
├── backend/          # Node.js/Express API
│   ├── models/       # MongoDB schemas
│   ├── routes/       # API routes
│   ├── server.js     # Main server
│   ├── seed.js       # Database seeding
│   └── package.json
└── frontend/         # React application
    └── frontend/
        ├── src/
        ├── public/
        └── package.json
```

## Quick Start

### Prerequisites

- Node.js (v14+)
- MongoDB (running locally)
- npm or yarn

### 1. Start MongoDB

```bash
# macOS with Homebrew:
brew services start mongodb-community

# Or run directly:
mongod
```

### 2. Setup Backend

```bash
cd baseball/backend

# Install dependencies
npm install

# Seed database with sample players
npm run seed

# Start the server (runs on port 3001)
npm start
```

The backend will be available at `http://localhost:3001`

### 3. Setup Frontend

In a new terminal:

```bash
cd baseball/frontend/frontend

# Install dependencies
npm install

# Start the React app (runs on port 3000)
npm start
```

The frontend will open at `http://localhost:3000`

## Features

- **Display Active Players**: View all active baseball players in a table
- **Home Run Statistics**: See total home runs for each player
- **Sorted by Performance**: Players are sorted by home run count (highest first)
- **REST API**: Full CRUD operations for player management

## API Documentation

See [backend/README.md](backend/README.md) for full API documentation.

### Key Endpoints

- `GET /api/players` - Get all active players (sorted by home runs)
- `POST /api/players` - Create a new player
- `PUT /api/players/:id` - Update player information
- `DELETE /api/players/:id` - Remove a player

## Development

### Backend Development

```bash
cd backend

# Run with auto-reload
npm run dev
```

### Frontend Development

The React app automatically reloads when you save changes.

## Sample Data

The database is seeded with 10 MLB players including:
- Aaron Judge (62 HR)
- Shohei Ohtani (54 HR)
- Juan Soto (41 HR)
- Kyle Schwarber (38 HR)
- And more...

## Troubleshooting

**MongoDB won't connect:**
- Ensure MongoDB is running: `brew services start mongodb-community`
- Check the MONGODB_URI in `backend/.env`

**Frontend can't reach backend:**
- Ensure backend is running on port 3001
- Check that CORS is enabled (it should be by default)

**Port already in use:**
- Backend: Change PORT in `backend/.env`
- Frontend: Use `PORT=3001 npm start` to change frontend port

## Technologies Used

**Backend:**
- Express.js - Web framework
- Mongoose - MongoDB ODM
- CORS - Cross-origin requests
- dotenv - Environment variables

**Frontend:**
- React 19 - UI framework
- React Scripts - Build tools
- Fetch API - HTTP requests
