import express from 'express';
import Game from '../models/Game';
import Player from '../models/Player';
import Move from '../models/Move';
import Connection from '../models/Connection';
import { generateRoomCode, calculateHits } from '../utils/gameUtils';
import { ensureConnection } from '../config/database';
import { updateGameActivity } from '../utils/cleanup';

const router = express.Router();

// Create new game room with player
router.post('/rooms', async (req, res) => {
  try {
    await ensureConnection();
    
    const { playerName, avatar, gameMode = '4d', digits = 4 } = req.body;
    
    console.log(`🏠 Create room request from: ${playerName} (${avatar})`);
    
    if (!playerName) {
      return res.status(400).json({ message: 'Player name is required' });
    }
    
    let code = generateRoomCode();
    
    // Ensure unique room code
    while (await Game.findOne({ code })) {
      code = generateRoomCode();
    }
    
    console.log(`🎲 Generated room code: ${code}`);
    
    // Create game
    const game = new Game({
      code,
      digits,
      gameMode,
      hostPlayer: playerName,
      gameSettings: {
        digits,
        allowDuplicates: false
      }
    });
    
    await game.save();
    
    // Create host player
    const player = new Player({
      name: playerName,
      avatar: avatar || '🎯',
      gameId: game._id,
      roomCode: code,
      position: 1
    });
    
    await player.save();
    
    // Update game player count
    game.currentPlayers = 1;
    await game.save();
    
    console.log(`✅ Room ${code} created successfully with host ${playerName}`);
    
    // Add cache headers for future polling
    const lastModified = new Date().toISOString();
    res.set({
      'Last-Modified': lastModified,
      'ETag': `"${game._id}-${game.updatedAt?.getTime()}"`
    });
    
    res.json({ 
      roomCode: code,
      message: 'Room created successfully',
      lastModified
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ message: 'Failed to create room' });
  }
});

// Join existing room
router.post('/rooms/join', async (req, res) => {
  try {
    await ensureConnection();
    
    const { roomCode, playerName, avatar } = req.body;
    
    console.log(`🚪 Join room request: ${playerName} wants to join ${roomCode}`);
    
    if (!roomCode || !playerName) {
      return res.status(400).json({ message: 'Room code and player name are required' });
    }
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      console.log(`❌ Game ${roomCode} not found or inactive`);
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'waiting') {
      console.log(`⚠️ Game ${roomCode} already started (state: ${game.state})`);
      return res.status(400).json({ message: 'Game has already started' });
    }
    
    // Check existing players
    const existingPlayers = await Player.find({ roomCode, gameId: game._id });
    
    // Check if player already exists
    const existingPlayer = existingPlayers.find(p => p.name === playerName);
    if (existingPlayer) {
      console.log(`⚠️ Player ${playerName} already exists in room ${roomCode}`);
      return res.status(400).json({ message: 'Player name already taken in this room' });
    }
    
    // Check room capacity (max 4 players)
    if (existingPlayers.length >= 4) {
      console.log(`🚫 Room ${roomCode} is full (${existingPlayers.length}/4)`);
      return res.status(400).json({ message: 'Room is full' });
    }
    
    // Create player
    const player = new Player({
      name: playerName,
      avatar: avatar || '🎯',
      gameId: game._id,
      roomCode,
      position: existingPlayers.length + 1
    });
    
    await player.save();
    
    // Update game player count
    game.currentPlayers = existingPlayers.length + 1;
    await game.save();
    
    // Update game activity
    await updateGameActivity(roomCode);
    
    console.log(`✅ Player ${playerName} joined room ${roomCode}. Total players: ${game.currentPlayers}`);
    
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
    await ensureConnection();
    
    const games = await Game.find({
      isActive: true,
      state: { $in: ['waiting', 'active'] }
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    const roomList = await Promise.all(
      games.map(async (game) => {
        const players = await Player.find({ gameId: game._id });
        const host = players.find(p => p.name === game.hostPlayer) || players[0];
        
        return {
          code: game.code,
          hostName: host?.name || 'Unknown',
          hostAvatar: host?.avatar || '🎯',
          gameMode: game.gameMode,
          playerCount: players.length,
          maxPlayers: game.maxPlayers,
          isGameStarted: game.state === 'active'
        };
      })
    );
    
    res.json({ rooms: roomList });
  } catch (error) {
    console.error('Error getting room list:', error);
    res.status(500).json({ message: 'Failed to get room list' });
  }
});

// Get room state for polling
router.get('/rooms/:code/state', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    
    console.log(`🔍 Getting room state for: ${code}`);
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      console.log(`❌ Room ${code} not found`);
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const players = await Player.find({ gameId: game._id });
    
    console.log(`👥 Found ${players.length} players in room ${code}`);
    
    // Check conditional request headers
    const ifModifiedSince = req.headers['if-modified-since'];
    const ifNoneMatch = req.headers['if-none-match'];
    
    const lastModified = game.updatedAt || game.createdAt;
    const etag = `"${game._id}-${lastModified.getTime()}"`;
    
    // Return 304 if not modified
    if (ifModifiedSince || ifNoneMatch) {
      const clientTime = ifModifiedSince ? new Date(ifModifiedSince) : null;
      if ((clientTime && lastModified <= clientTime) || ifNoneMatch === etag) {
        return res.status(304).end();
      }
    }
    
    const playerStates = players.map(p => ({
      name: p.name,
      avatar: p.avatar,
      isReady: p.isReady,
      isConnected: p.isConnected
    }));
    
    const roomState = {
      game: {
        code: game.code,
        state: game.state,
        digits: game.digits,
        winner: game.winner
      },
      players: playerStates,
      lastModified: lastModified.toISOString()
    };
    
    // Set cache headers
    res.set({
      'Last-Modified': lastModified.toUTCString(),
      'ETag': etag,
      'Cache-Control': 'private, max-age=0'
    });
    
    console.log(`✅ Room state for ${code}: ${playerStates.length} players, state: ${game.state}`);
    res.json(roomState);
  } catch (error) {
    console.error('Error getting room state:', error);
    res.status(500).json({ message: 'Failed to get room state' });
  }
});

// Set player secret
router.post('/rooms/secret', async (req, res) => {
  try {
    await ensureConnection();
    
    const { roomCode, secret, playerName } = req.body;
    
    console.log(`🔐 Set secret request for room ${roomCode} from player ${playerName}`);
    
    if (!roomCode || !secret || !playerName) {
      return res.status(400).json({ message: 'Room code, secret, and player name are required' });
    }
    
    if (!/^\d{4}$/.test(secret)) {
      return res.status(400).json({ message: 'Secret must be exactly 4 digits' });
    }
    
    // Check for duplicate digits
    if (new Set(secret).size !== 4) {
      return res.status(400).json({ message: 'Secret must have unique digits' });
    }
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const player = await Player.findOne({ gameId: game._id, name: playerName });
    if (!player) {
      console.log(`❌ Player ${playerName} not found in room ${roomCode}`);
      return res.status(404).json({ message: 'Player not found in this room' });
    }
    
    if (player.secret) {
      console.log(`⚠️ Player ${playerName} already has a secret set`);
      return res.status(400).json({ message: 'Secret already set for this player' });
    }
    
    // Set secret for player
    player.secret = secret;
    player.isReady = true;
    await player.save();
    
    console.log(`✅ Secret set for player: ${player.name}`);
    
    // Check if all players are ready to start game
    const allPlayers = await Player.find({ gameId: game._id });
    const readyPlayers = allPlayers.filter(p => p.isReady);
    
    console.log(`📊 Ready players: ${readyPlayers.length}/${allPlayers.length}`);
    
    if (readyPlayers.length >= 2 && readyPlayers.length === allPlayers.length) {
      game.state = 'active';
      game.startedAt = new Date();
      await game.save();
      
      console.log(`🎮 Game ${roomCode} is now ACTIVE with ${readyPlayers.length} players`);
    }
    
    // Update game activity
    await updateGameActivity(roomCode);
    
    res.json({ message: 'Secret set successfully' });
  } catch (error) {
    console.error('Error setting secret:', error);
    res.status(500).json({ message: 'Failed to set secret' });
  }
});

// Make a guess
router.post('/rooms/guess', async (req, res) => {
  try {
    await ensureConnection();
    
    const { roomCode, guess, playerName, targetPlayer } = req.body;
    
    if (!roomCode || !guess || !playerName) {
      return res.status(400).json({ message: 'Room code, guess, and player name are required' });
    }
    
    if (!/^\d{4}$/.test(guess)) {
      return res.status(400).json({ message: 'Guess must be exactly 4 digits' });
    }
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'active') {
      return res.status(400).json({ message: 'Game is not in progress' });
    }
    
    const guessingPlayer = await Player.findOne({ gameId: game._id, name: playerName });
    if (!guessingPlayer) {
      return res.status(404).json({ message: 'Player not found in this room' });
    }
    
    // Find target player
    const target = await Player.findOne({ 
      gameId: game._id, 
      name: targetPlayer || { $ne: playerName },
      secret: { $exists: true }
    });
    
    if (!target || !target.secret) {
      return res.status(400).json({ message: 'No valid target player found' });
    }
    
    // Calculate hits
    const hits = calculateHits(guess, target.secret);
    
    // Save move
    const moveCount = await Move.countDocuments({ gameId: game._id });
    const move = new Move({
      gameId: game._id,
      roomCode,
      fromPlayer: playerName,
      targetPlayer: target.name,
      from: guessingPlayer._id,
      to: target._id,
      guess,
      hits,
      moveNumber: moveCount + 1,
      isWinning: hits === 4
    });
    
    await move.save();
    
    // Update player stats
    guessingPlayer.stats.guessesMade++;
    if (hits > 0) {
      guessingPlayer.stats.correctGuesses++;
    }
    await guessingPlayer.save();
    
    // Check for win
    if (hits === 4) {
      game.state = 'finished';
      game.winner = guessingPlayer._id;
      await game.save();
      
      // Update winner stats
      guessingPlayer.stats.gamesWon++;
      await guessingPlayer.save();
      
      console.log(`🎉 Game ${roomCode} finished! Winner: ${playerName}`);
    }
    
    // Update game activity
    await updateGameActivity(roomCode);
    
    res.json({ 
      hits,
      isWinning: hits === 4,
      targetPlayer: target.name,
      message: 'Guess processed successfully'
    });
  } catch (error) {
    console.error('Error making guess:', error);
    res.status(500).json({ message: 'Failed to make guess' });
  }
});

// Heartbeat endpoint to track player connections
router.post('/players/heartbeat', async (req, res) => {
  try {
    await ensureConnection();
    
    const { roomCode, playerName, sessionId } = req.body;
    
    if (!roomCode || !playerName) {
      return res.status(400).json({ message: 'Room code and player name are required' });
    }
    
    // Update player heartbeat
    const player = await Player.findOneAndUpdate(
      { roomCode, name: playerName },
      { 
        lastHeartbeat: new Date(),
        isConnected: true
      },
      { new: true }
    );
    
    if (player) {
      // Update connection tracking
      await Connection.findOneAndUpdate(
        { roomCode, playerName },
        {
          roomCode,
          playerName,
          sessionId: sessionId || `${playerName}-${Date.now()}`,
          lastSeen: new Date(),
          isActive: true,
          userAgent: req.headers['user-agent']
        },
        { upsert: true, new: true }
      );
    }
    
    res.json({ message: 'Heartbeat updated' });
  } catch (error) {
    console.error('Error updating heartbeat:', error);
    res.status(500).json({ message: 'Failed to update heartbeat' });
  }
});

// Get recent moves for a room
router.get('/rooms/:code/moves', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    const { since } = req.query;
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const query: any = { gameId: game._id };
    if (since) {
      query.timestamp = { $gt: new Date(since as string) };
    }
    
    const moves = await Move.find(query)
      .sort({ timestamp: -1 })
      .limit(50);
    
    res.json({ moves });
  } catch (error) {
    console.error('Error getting moves:', error);
    res.status(500).json({ message: 'Failed to get moves' });
  }
});

export default router;