import express from 'express';
import Game from '../models/Game';
import Player from '../models/Player';
import Move from '../models/Move';
import { generateRoomCode } from '../utils/gameUtils';

const router = express.Router();

// Create new game room with player
router.post('/rooms', async (req, res) => {
  try {
    // Check if database is connected
    if (!process.env.MONGODB_URI) {
      return res.status(503).json({ 
        message: 'Database not configured. Please contact administrator.' 
      });
    }
    
    const { playerName, avatar, gameMode = 'classic', digits = 4 } = req.body;
    
    if (!playerName) {
      return res.status(400).json({ message: 'Player name is required' });
    }
    
    let code = generateRoomCode();
    
    // Ensure unique room code
    while (await Game.findOne({ code })) {
      code = generateRoomCode();
    }
    
    // Create game
    const game = new Game({ 
      code, 
      digits, 
      state: 'waiting'
    });
    await game.save();
    
    // Create host player
    const player = new Player({
      name: playerName,
      avatar: avatar || '🎯',
      gameId: game._id,
      isReady: false
    });
    await player.save();
    
    res.json({ 
      roomCode: code,
      message: 'Room created successfully'
    });
  } catch (error) {
    console.error('Error creating room:', error);
    
    // More detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
      
      if (error.message.includes('buffering timed out')) {
        return res.status(500).json({ 
          message: 'Database connection failed. Please check MongoDB setup.' 
        });
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to create room', 
      error: process.env.NODE_ENV === 'development' ? errorMessage : undefined 
    });
  }
});

// Join existing room
router.post('/rooms/join', async (req, res) => {
  try {
    const { roomCode, playerName, avatar } = req.body;
    
    if (!roomCode || !playerName) {
      return res.status(400).json({ message: 'Room code and player name are required' });
    }
    
    const game = await Game.findOne({ code: roomCode });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'waiting') {
      return res.status(400).json({ message: 'Game has already started' });
    }
    
    // Check if player already exists
    const existingPlayer = await Player.findOne({ 
      gameId: game._id, 
      name: playerName 
    });
    
    if (existingPlayer) {
      return res.status(400).json({ message: 'Player name already taken in this room' });
    }
    
    // Check room capacity (max 4 players)
    const playerCount = await Player.countDocuments({ gameId: game._id });
    if (playerCount >= 4) {
      return res.status(400).json({ message: 'Room is full' });
    }
    
    // Create player
    const player = new Player({
      name: playerName,
      avatar: avatar || '🎯',
      gameId: game._id,
      isHost: false,
      isReady: false
    });
    await player.save();
    
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
    const games = await Game.find({ 
      state: { $in: ['waiting', 'active'] } 
    }).sort({ createdAt: -1 }).limit(20);
    
    const rooms = await Promise.all(games.map(async (game) => {
      const players = await Player.find({ gameId: game._id });
      const host = players[0]; // First player is considered host
      
      return {
        code: game.code,
        hostName: host?.name || 'Unknown',
        hostAvatar: host?.avatar || '🎯',
        gameMode: 'classic', // Default game mode
        playerCount: players.length,
        maxPlayers: 4,
        isGameStarted: game.state === 'active'
      };
    }));
    
    res.json({ rooms });
  } catch (error) {
    console.error('Error getting room list:', error);
    res.status(500).json({ message: 'Failed to get room list' });
  }
});

// Get room state for polling
router.get('/rooms/:code/state', async (req, res) => {
  try {
    const { code } = req.params;
    
    const game = await Game.findOne({ code });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const players = await Player.find({ gameId: game._id }).select('-secret');
    
    const roomState = {
      game: {
        code: game.code,
        state: game.state,
        digits: game.digits
      },
      players: players.map(p => ({
        name: p.name,
        avatar: p.avatar,
        isReady: p.isReady
      }))
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
    
    const game = await Game.findOne({ code: roomCode });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // For simplicity, we'll assume the first player to set secret becomes ready
    const player = await Player.findOne({ gameId: game._id });
    if (player) {
      player.secret = secret;
      player.isReady = true;
      await player.save();
      
      // Check if all players are ready to start game
      const allPlayers = await Player.find({ gameId: game._id });
      const readyPlayers = allPlayers.filter(p => p.isReady);
      
      if (readyPlayers.length >= 2 && readyPlayers.length === allPlayers.length) {
        game.state = 'active';
        await game.save();
      }
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
    
    const game = await Game.findOne({ code: roomCode });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'active') {
      return res.status(400).json({ message: 'Game is not in progress' });
    }
    
    const guessingPlayer = await Player.findOne({ 
      gameId: game._id, 
      name: playerName 
    });
    
    if (!guessingPlayer) {
      return res.status(404).json({ message: 'Player not found in this room' });
    }
    
    // Find target player (for simplicity, guess against the first other player)
    const targetPlayer = await Player.findOne({ 
      gameId: game._id, 
      name: { $ne: playerName },
      secret: { $exists: true, $ne: null }
    });
    
    if (!targetPlayer) {
      return res.status(400).json({ message: 'No valid target player found' });
    }
    
    // Calculate hit
    const secret = targetPlayer.secret;
    if (!secret) {
      return res.status(400).json({ message: 'Target player has no secret set' });
    }
    
    let hit = 0;
    
    for (let i = 0; i < 4; i++) {
      if (guess[i] === secret[i]) {
        hit++;
      }
    }
    
    // Save move
    const move = new Move({
      gameId: game._id,
      from: guessingPlayer.name,
      to: targetPlayer.name,
      guess: guess,
      hit: hit
    });
    await move.save();
    
    // Check for win
    if (hit === 4) {
      game.state = 'finished';
      game.winner = guessingPlayer._id;
      await game.save();
    }
    
    res.json({ 
      hit: hit,
      message: hit === 4 ? 'Correct! You win!' : `${hit} correct digits in correct positions`
    });
  } catch (error) {
    console.error('Error making guess:', error);
    res.status(500).json({ message: 'Failed to make guess' });
  }
});

// Get room info (legacy endpoint)
router.get('/rooms/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const game = await Game.findOne({ code });
    if (!game) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    const players = await Player.find({ gameId: game._id }).select('-secret');
    
    res.json({ 
      success: true, 
      game: {
        code: game.code,
        digits: game.digits,
        state: game.state,
        playerCount: players.length
      },
      players 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get room' });
  }
});

export default router;