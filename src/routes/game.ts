import express from 'express';
import { generateRoomCode } from '../utils/gameUtils';

const router = express.Router();

// In-memory storage for quick gameplay
interface InMemoryGame {
  code: string;
  digits: number;
  state: 'waiting' | 'active' | 'finished';
  winner?: string;
  startedAt?: Date;
  createdAt: Date;
}

interface InMemoryPlayer {
  name: string;
  avatar: string;
  secret?: string;
  gameId: string;
  isReady: boolean;
  createdAt: Date;
}

const games = new Map<string, InMemoryGame>();
const players = new Map<string, InMemoryPlayer[]>();

// Create new game room with player
router.post('/rooms', async (req, res) => {
  try {
    const { playerName, avatar, gameMode = 'classic', digits = 4 } = req.body;
    
    if (!playerName) {
      return res.status(400).json({ message: 'Player name is required' });
    }
    
    let code = generateRoomCode();
    
    // Ensure unique room code
    while (games.has(code)) {
      code = generateRoomCode();
    }
    
    // Create game
    const game: InMemoryGame = { 
      code, 
      digits, 
      state: 'waiting',
      createdAt: new Date()
    };
    games.set(code, game);
    
    // Create host player
    const player: InMemoryPlayer = {
      name: playerName,
      avatar: avatar || '🎯',
      gameId: code,
      isReady: false,
      createdAt: new Date()
    };
    
    players.set(code, [player]);
    
    res.json({ 
      roomCode: code,
      message: 'Room created successfully'
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ message: 'Failed to create room' });
  }
});

// Join existing room
router.post('/rooms/join', async (req, res) => {
  try {
    const { roomCode, playerName, avatar } = req.body;
    
    if (!roomCode || !playerName) {
      return res.status(400).json({ message: 'Room code and player name are required' });
    }
    
    const game = games.get(roomCode);
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'waiting') {
      return res.status(400).json({ message: 'Game has already started' });
    }
    
    const roomPlayers = players.get(roomCode) || [];
    
    // Check if player already exists
    const existingPlayer = roomPlayers.find(p => p.name === playerName);
    if (existingPlayer) {
      return res.status(400).json({ message: 'Player name already taken in this room' });
    }
    
    // Check room capacity (max 4 players)
    if (roomPlayers.length >= 4) {
      return res.status(400).json({ message: 'Room is full' });
    }
    
    // Create player
    const player: InMemoryPlayer = {
      name: playerName,
      avatar: avatar || '🎯',
      gameId: roomCode,
      isReady: false,
      createdAt: new Date()
    };
    
    roomPlayers.push(player);
    players.set(roomCode, roomPlayers);
    
    res.json({ 
      message: 'Joined room successfully'
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ message: 'Failed to join room' });
  }
});

// Get all available rooms
router.get('/rooms', async (req, res) => {
  try {
    const roomList = Array.from(games.values())
      .filter(game => ['waiting', 'active'].includes(game.state))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map(game => {
        const roomPlayers = players.get(game.code) || [];
        const host = roomPlayers[0];
        
        return {
          code: game.code,
          hostName: host?.name || 'Unknown',
          hostAvatar: host?.avatar || '🎯',
          gameMode: 'classic',
          playerCount: roomPlayers.length,
          maxPlayers: 4,
          isGameStarted: game.state === 'active'
        };
      });
    
    res.json({ rooms: roomList });
  } catch (error) {
    console.error('Error getting room list:', error);
    res.status(500).json({ message: 'Failed to get room list' });
  }
});

// Get room state for polling
router.get('/rooms/:code/state', async (req, res) => {
  try {
    const { code } = req.params;
    
    const game = games.get(code);
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const roomPlayers = (players.get(code) || []).map(p => ({
      name: p.name,
      avatar: p.avatar,
      isReady: p.isReady
    }));
    
    const roomState = {
      game: {
        code: game.code,
        state: game.state,
        digits: game.digits
      },
      players: roomPlayers
    };
    
    res.json(roomState);
  } catch (error) {
    console.error('Error getting room state:', error);
    res.status(500).json({ message: 'Failed to get room state' });
  }
});

// Set player secret
router.post('/rooms/secret', async (req, res) => {
  try {
    const { roomCode, secret } = req.body;
    
    if (!roomCode || !secret) {
      return res.status(400).json({ message: 'Room code and secret are required' });
    }
    
    if (!/^\d{4}$/.test(secret)) {
      return res.status(400).json({ message: 'Secret must be exactly 4 digits' });
    }
    
    // Check for duplicate digits
    if (new Set(secret).size !== 4) {
      return res.status(400).json({ message: 'Secret must have unique digits' });
    }
    
    const game = games.get(roomCode);
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const roomPlayers = players.get(roomCode) || [];
    // For simplicity, set secret for first player who doesn't have one
    const player = roomPlayers.find(p => !p.secret);
    if (player) {
      player.secret = secret;
      player.isReady = true;
      
      // Check if all players are ready to start game
      const readyPlayers = roomPlayers.filter(p => p.isReady);
      
      if (readyPlayers.length >= 2 && readyPlayers.length === roomPlayers.length) {
        game.state = 'active';
        game.startedAt = new Date();
        games.set(roomCode, game);
      }
      
      players.set(roomCode, roomPlayers);
    }
    
    res.json({ message: 'Secret set successfully' });
  } catch (error) {
    console.error('Error setting secret:', error);
    res.status(500).json({ message: 'Failed to set secret' });
  }
});

// Make a guess
router.post('/rooms/guess', async (req, res) => {
  try {
    const { roomCode, guess, playerName } = req.body;
    
    if (!roomCode || !guess || !playerName) {
      return res.status(400).json({ message: 'Room code, guess, and player name are required' });
    }
    
    if (!/^\d{4}$/.test(guess)) {
      return res.status(400).json({ message: 'Guess must be exactly 4 digits' });
    }
    
    const game = games.get(roomCode);
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'active') {
      return res.status(400).json({ message: 'Game is not in progress' });
    }
    
    const roomPlayers = players.get(roomCode) || [];
    const guessingPlayer = roomPlayers.find(p => p.name === playerName);
    
    if (!guessingPlayer) {
      return res.status(404).json({ message: 'Player not found in this room' });
    }
    
    // Find target player (for simplicity, guess against the first other player)
    const targetPlayer = roomPlayers.find(p => 
      p.name !== playerName && p.secret
    );
    
    if (!targetPlayer || !targetPlayer.secret) {
      return res.status(400).json({ message: 'No valid target player found' });
    }
    
    // Calculate hit
    const secret = targetPlayer.secret;
    let hit = 0;
    
    for (let i = 0; i < 4; i++) {
      if (guess[i] === secret[i]) {
        hit++;
      }
    }
    
    // Check for win
    if (hit === 4) {
      game.state = 'finished';
      game.winner = guessingPlayer.name;
      games.set(roomCode, game);
    }
    
    res.json({ 
      hit: hit,
      message: 'Guess processed successfully'
    });
  } catch (error) {
    console.error('Error making guess:', error);
    res.status(500).json({ message: 'Failed to make guess' });
  }
});

export default router;