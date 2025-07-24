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
        allowDuplicates: digits <= 2, // Allow duplicates for 1-2 digit games
        maxPlayers: 4
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
    
    // Check if player already exists - if so, allow rejoin
    const existingPlayer = existingPlayers.find(p => p.name === playerName);
    if (existingPlayer) {
      console.log(`🔄 Player ${playerName} rejoining room ${roomCode}`);
      // Mark player as connected again
      existingPlayer.isConnected = true;
      await existingPlayer.save();
      
      console.log(`✅ Player ${playerName} reconnected to room ${roomCode}`);
      return res.json({ message: 'Rejoined room successfully' });
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

// Get detailed gameplay state with turn info
router.get('/rooms/:code/gameplay', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    
    console.log(`🎮 Getting gameplay state for: ${code}`);
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      console.log(`❌ Room ${code} not found`);
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const players = await Player.find({ gameId: game._id });
    
    // Check conditional request headers for caching
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
    
    // Calculate turn timer
    let turnTimeRemaining = 0;
    if (game.state === 'active' && game.turnStartTime) {
      const elapsed = Date.now() - game.turnStartTime.getTime();
      turnTimeRemaining = Math.max(0, (game.turnTimeLimit || 30) * 1000 - elapsed);
    }
    
    // Get recent moves for context
    const recentMoves = await Move.find({ gameId: game._id })
      .sort({ timestamp: -1 })
      .limit(5)
      .select('fromPlayer targetPlayer guess hits timestamp turnNumber');
    
    const playerStates = players.map(p => ({
      name: p.name,
      avatar: p.avatar,
      isReady: p.isReady,
      isConnected: p.isConnected,
      isAlive: game.state === 'finished' ? (game.winner?.toString() === p._id.toString()) : true,
      turnOrder: game.turnOrder.indexOf(p.name) + 1,
      stats: {
        guessesMade: p.stats?.guessesMade || 0,
        correctGuesses: p.stats?.correctGuesses || 0,
        gamesWon: p.stats?.gamesWon || 0
      }
    }));
    
    const gameplayState = {
      game: {
        code: game.code,
        state: game.state,
        digits: game.digits,
        currentTurn: game.currentTurn,
        turnTimeRemaining: Math.floor(turnTimeRemaining / 1000), // seconds
        currentRound: game.currentRound || 1,
        maxRounds: game.maxRounds,
        winner: game.winner
      },
      players: playerStates,
      turnOrder: game.turnOrder || [],
      recentMoves: recentMoves.map(m => ({
        player: m.fromPlayer,
        target: m.targetPlayer,
        hits: m.hits,
        timestamp: m.timestamp,
        turnNumber: m.turnNumber
      })),
      nextPollIn: game.state === 'active' ? 1000 : 3000, // ms
      lastModified: lastModified.toISOString()
    };
    
    // Set cache headers
    res.set({
      'Last-Modified': lastModified.toUTCString(),
      'ETag': etag,
      'Cache-Control': 'private, max-age=0'
    });
    
    console.log(`✅ Gameplay state for ${code}: Turn=${game.currentTurn}, Round=${game.currentRound}`);
    res.json(gameplayState);
  } catch (error) {
    console.error('Error getting gameplay state:', error);
    res.status(500).json({ message: 'Failed to get gameplay state' });
  }
});

// Get room state for polling (legacy endpoint)
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
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Validate secret based on game mode
    const expectedDigits = game.digits;
    const digitRegex = new RegExp(`^\\d{${expectedDigits}}$`);
    
    if (!digitRegex.test(secret)) {
      return res.status(400).json({ message: `Secret must be exactly ${expectedDigits} digits` });
    }
    
    // Check for duplicate digits based on game rules
    // For 1-2 digit games: allow duplicates (e.g., "11", "22")
    // For 3+ digit games: require unique digits (e.g., "123" not "112")
    const allowDuplicates = game.gameSettings?.allowDuplicates ?? (expectedDigits <= 2);
    const uniqueDigitsCount = new Set(secret).size;
    
    console.log(`🔐 Validating secret "${secret}": digits=${expectedDigits}, unique=${uniqueDigitsCount}, allowDuplicates=${allowDuplicates}`);
    
    if (!allowDuplicates && uniqueDigitsCount !== expectedDigits) {
      console.log(`❌ Secret rejected: has ${uniqueDigitsCount} unique digits but needs ${expectedDigits} unique digits`);
      return res.status(400).json({ message: `Secret must have ${expectedDigits} unique digits (no duplicates allowed for ${expectedDigits}-digit games)` });
    }
    
    console.log(`✅ Secret validation passed: "${secret}" is valid for ${expectedDigits}-digit game (allowDuplicates: ${allowDuplicates})`);
    
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

// Start game manually
router.post('/rooms/start', async (req, res) => {
  try {
    await ensureConnection();
    
    const { roomCode, playerName } = req.body;
    
    console.log(`🎮 Start game request for room ${roomCode} from ${playerName}`);
    
    if (!roomCode || !playerName) {
      return res.status(400).json({ message: 'Room code and player name are required' });
    }
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'waiting') {
      return res.status(400).json({ message: 'Game has already started or finished' });
    }
    
    // Check if requesting player is in the room
    const player = await Player.findOne({ gameId: game._id, name: playerName });
    if (!player) {
      return res.status(404).json({ message: 'Player not found in this room' });
    }
    
    // Check if we have at least 2 players
    const allPlayers = await Player.find({ gameId: game._id });
    const connectedPlayers = allPlayers.filter(p => p.isConnected !== false);
    
    if (connectedPlayers.length < 2) {
      return res.status(400).json({ message: 'Need at least 2 players to start the game' });
    }
    
    // Check if all connected players are ready (have secrets)
    const readyPlayers = connectedPlayers.filter(p => p.isReady && p.secret);
    
    if (readyPlayers.length !== connectedPlayers.length) {
      return res.status(400).json({ message: 'All players must set their secrets before starting' });
    }
    
    // Start the game
    game.state = 'active';
    game.startedAt = new Date();
    await game.save();
    
    console.log(`🎮 Game ${roomCode} started manually with ${connectedPlayers.length} players`);
    
    // Update game activity
    await updateGameActivity(roomCode);
    
    res.json({ message: 'Game started successfully' });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ message: 'Failed to start game' });
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
    
    const game = await Game.findOne({ code: roomCode, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Validate guess based on game mode
    const expectedDigits = game.digits;
    const digitRegex = new RegExp(`^\\d{${expectedDigits}}$`);
    
    if (!digitRegex.test(guess)) {
      return res.status(400).json({ message: `Guess must be exactly ${expectedDigits} digits` });
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
      isWinning: hits === expectedDigits
    });
    
    await move.save();
    
    // Update player stats
    guessingPlayer.stats.guessesMade++;
    if (hits > 0) {
      guessingPlayer.stats.correctGuesses++;
    }
    await guessingPlayer.save();
    
    // Check for win
    if (hits === expectedDigits) {
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
      isWinning: hits === expectedDigits,
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

// Skip turn (timeout or voluntary)
router.post('/rooms/:code/skip-turn', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    const { playerName, reason = 'voluntary' } = req.body;
    
    if (!playerName) {
      return res.status(400).json({ message: 'Player name is required' });
    }
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'active') {
      return res.status(400).json({ message: 'Game is not active' });
    }
    
    if (game.currentTurn !== playerName) {
      return res.status(400).json({ message: 'Not your turn to skip' });
    }
    
    // Advance to next player
    const currentIndex = game.turnOrder.indexOf(playerName);
    const nextIndex = (currentIndex + 1) % game.turnOrder.length;
    const nextPlayer = game.turnOrder[nextIndex];
    
    game.currentTurn = nextPlayer;
    game.turnStartTime = new Date();
    
    // Check if we completed a round
    if (nextIndex === 0) {
      game.currentRound++;
      console.log(`🔄 Round ${game.currentRound} started in room ${code} (${playerName} skipped)`);
    }
    
    await game.save();
    await updateGameActivity(code);
    
    console.log(`⏭️ ${playerName} skipped turn (${reason}). Next: ${nextPlayer}`);
    
    res.json({
      message: 'Turn skipped successfully',
      nextPlayer,
      currentRound: game.currentRound,
      reason
    });
  } catch (error) {
    console.error('Error skipping turn:', error);
    res.status(500).json({ message: 'Failed to skip turn' });
  }
});

// Get available targets for current player
router.get('/rooms/:code/targets/:playerName', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code, playerName } = req.params;
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    if (game.state !== 'active') {
      return res.status(400).json({ message: 'Game is not active' });
    }
    
    // Get all players except the requesting player
    const players = await Player.find({ 
      gameId: game._id, 
      name: { $ne: playerName },
      secret: { $exists: true }
    });
    
    // Get recent moves to show hit history
    const recentMoves = await Move.find({ 
      gameId: game._id,
      fromPlayer: playerName 
    }).sort({ timestamp: -1 });
    
    const availableTargets = players.map(p => {
      const movesAgainstTarget = recentMoves.filter(m => m.targetPlayer === p.name);
      const bestHits = movesAgainstTarget.length > 0 ? Math.max(...movesAgainstTarget.map(m => m.hits)) : 0;
      
      return {
        name: p.name,
        avatar: p.avatar,
        isEliminated: false, // Could add elimination logic later
        previousBestHits: bestHits,
        totalGuessesAgainst: movesAgainstTarget.length
      };
    });
    
    res.json({ availableTargets });
  } catch (error) {
    console.error('Error getting targets:', error);
    res.status(500).json({ message: 'Failed to get targets' });
  }
});

// Long polling for game events
router.get('/rooms/:code/events', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    const { lastEventId, timeout = 30 } = req.query;
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const timeoutMs = Math.min(parseInt(timeout as string) * 1000, 30000); // Max 30 seconds
    const startTime = Date.now();
    
    // Simple long polling implementation
    const checkForEvents = async (): Promise<any[]> => {
      // Get recent moves as events
      const query: any = { gameId: game._id };
      if (lastEventId) {
        query._id = { $gt: lastEventId };
      }
      
      const moves = await Move.find(query)
        .sort({ timestamp: 1 })
        .limit(10);
      
      const events = moves.map(move => ({
        id: move._id,
        type: move.isWinning ? 'game_end' : 'guess_made',
        player: move.fromPlayer,
        target: move.targetPlayer,
        timestamp: move.timestamp,
        data: {
          guess: move.guess,
          hits: move.hits,
          turnNumber: move.turnNumber,
          round: move.round
        }
      }));
      
      // Check for turn changes
      const currentGame = await Game.findById(game._id);
      if (currentGame && currentGame.currentTurn !== game.currentTurn) {
        events.push({
          id: `turn-${Date.now()}`,
          type: 'turn_start',
          player: currentGame.currentTurn || '',
          target: '',
          timestamp: currentGame.turnStartTime || new Date(),
          data: { 
            guess: '',
            hits: 0,
            turnNumber: 0,
            round: currentGame.currentRound || 1
          }
        });
      }
      
      return events;
    };
    
    // Poll for events with timeout
    const poll = async (): Promise<void> => {
      const events = await checkForEvents();
      
      if (events.length > 0 || Date.now() - startTime >= timeoutMs) {
        const nextPoll = game.state === 'active' ? 1000 : 3000;
        res.json({ 
          events, 
          nextPoll,
          hasMore: events.length === 10 
        });
        return;
      }
      
      // Wait 1 second before checking again
      setTimeout(poll, 1000);
    };
    
    await poll();
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ message: 'Failed to get events' });
  }
});

// Get recent moves for a room
router.get('/rooms/:code/moves', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    const { since, page = 1, limit = 20 } = req.query;
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    const query: any = { gameId: game._id };
    if (since) {
      query.timestamp = { $gt: new Date(since as string) };
    }
    
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 50);
    const skip = (pageNum - 1) * limitNum;
    
    const [moves, total] = await Promise.all([
      Move.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum),
      Move.countDocuments(query)
    ]);
    
    const avgGuessTime = await Move.aggregate([
      { $match: query },
      { $group: { _id: null, avgTime: { $avg: '$timeToGuess' } } }
    ]);
    
    res.json({ 
      moves: moves.map(m => ({
        id: m._id,
        fromPlayer: m.fromPlayer,
        targetPlayer: m.targetPlayer,
        guess: m.guess,
        hits: m.hits,
        timestamp: m.timestamp,
        turnNumber: m.turnNumber,
        round: m.round,
        timeToGuess: Math.floor((m.timeToGuess || 0) / 1000), // seconds
        isWinning: m.isWinning
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      gameStats: {
        totalMoves: total,
        avgGuessTime: avgGuessTime[0]?.avgTime ? Math.floor(avgGuessTime[0].avgTime / 1000) : 0
      }
    });
  } catch (error) {
    console.error('Error getting moves:', error);
    res.status(500).json({ message: 'Failed to get moves' });
  }
});

// Delete room endpoint
router.delete('/rooms/:code', async (req, res) => {
  try {
    await ensureConnection();
    
    const { code } = req.params;
    
    console.log(`🗑️ Delete room request for: ${code}`);
    
    const game = await Game.findOne({ code, isActive: true });
    if (!game) {
      return res.status(404).json({ message: 'Room not found' });
    }
    
    // Mark game as inactive instead of deleting
    game.isActive = false;
    await game.save();
    
    // Mark all players as disconnected
    await Player.updateMany(
      { gameId: game._id },
      { isConnected: false }
    );
    
    console.log(`✅ Room ${code} deleted successfully`);
    
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ message: 'Failed to delete room' });
  }
});

// Delete all rooms endpoint
router.delete('/rooms', async (req, res) => {
  try {
    await ensureConnection();
    
    console.log(`🗑️ Delete all rooms request`);
    
    // Mark all active games as inactive
    const result = await Game.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // Mark all players as disconnected
    await Player.updateMany(
      {},
      { isConnected: false }
    );
    
    console.log(`✅ Deleted ${result.modifiedCount} rooms successfully`);
    
    res.json({ 
      message: `${result.modifiedCount} rooms deleted successfully`,
      deletedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error deleting all rooms:', error);
    res.status(500).json({ message: 'Failed to delete all rooms' });
  }
});

export default router;