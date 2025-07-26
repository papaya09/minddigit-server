const express = require('express');
const cors = require('cors');

// Store rooms in memory for local testing
const rooms = {};

// In-memory player storage  
const players = {};

// Utility function to calculate bulls and cows
function calculateBullsAndCows(guess, secret) {
    let bulls = 0;
    let cows = 0;
    
    // Convert to arrays for easier manipulation
    const guessArray = guess.split('');
    const secretArray = secret.split('');
    
    // Count bulls (correct digit in correct position)
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] === secretArray[i]) {
            bulls++;
            guessArray[i] = null;  // Mark as used
            secretArray[i] = null; // Mark as used
        }
    }
    
    // Count cows (correct digit in wrong position)
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] !== null) {
            const secretIndex = secretArray.indexOf(guessArray[i]);
            if (secretIndex !== -1) {
                cows++;
                secretArray[secretIndex] = null; // Mark as used
            }
        }
    }
    
    return { bulls, cows };
}

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://192.168.1.140:3000', 
    'http://192.168.1.140:8080',
    'https://minddigit-server.vercel.app',
    // Allow iOS app requests
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost'
  ],
  credentials: true
}));
app.use(express.json());

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

// Clean up old rooms periodically
function cleanupOldRooms() {
  const now = Date.now();
  const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  for (const [roomId, room] of Object.entries(rooms)) {
    const roomAge = now - new Date(room.createdAt).getTime();
    if (roomAge > ROOM_TIMEOUT) {
      console.log('🧹 Cleaning up old room:', roomId);
      delete rooms[roomId];
      
      // Clean up associated players
      for (const [playerId, player] of Object.entries(players)) {
        if (player.roomId === roomId) {
          delete players[playerId];
        }
      }
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldRooms, 5 * 60 * 1000);

console.log('🚀 Test Server starting...');

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    mode: 'test' 
  });
});

// Health check
app.get('/api/health', (req, res) => {
  console.log('📊 Health check requested');
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    message: 'MindDigits Test Server',
    mode: 'test',
    activeRooms: Object.keys(rooms).length,
    activePlayers: Object.keys(players).length
  });
});

// Join room (local)
app.post('/api/room/join-local', (req, res) => {
  const { playerName } = req.body;
  console.log('🚀 Join requested for:', playerName);
  
  // First, try to find an existing room with only 1 player in WAITING state
  let availableRoom = null;
  let availableRoomId = null;
  
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.gameState === 'WAITING' && room.currentPlayerCount === 1) {
      availableRoom = room;
      availableRoomId = roomId;
      console.log('🔍 Found available room:', roomId, 'with', room.currentPlayerCount, 'players');
      break;
    }
  }
  
  const playerId = generatePlayerId();
  
  if (availableRoom) {
    // Join existing room as player 2
    const position = 2;
    const newPlayer = { 
      id: playerId, 
      name: playerName, 
      position: position,
      secret: null, // No auto-generation, player will set their own
      selectedDigits: null
    };
    availableRoom.players.push(newPlayer);
    availableRoom.currentPlayerCount = 2;
    console.log('✅ Player 2 joined, both players need to select digits and set secrets');
    
    // Start with digit selection when 2 players join
    availableRoom.gameState = 'DIGIT_SELECTION';
    console.log('🎮 2 players joined room:', availableRoomId, '- starting digit selection phase');
    
    // Store player
    players[playerId] = {
      id: playerId,
      name: playerName,
      roomId: availableRoomId,
      position: position
    };
    
    console.log('✅ Player', playerName, 'joined existing room', availableRoomId, 'as position', position);
    
    res.json({
      success: true,
      roomId: availableRoomId,
      playerId: playerId,
      position: position,
      gameState: 'DIGIT_SELECTION',
      message: 'Joined existing room - ready to select digits!',
      fallbackMode: true,
      mode: 'test'
    });
  } else {
    // Create new room as player 1
    const roomId = generateRoomId();
    const position = 1;
    
    rooms[roomId] = {
      id: roomId,
      players: [{ id: playerId, name: playerName, position: position }],
      gameState: 'WAITING',
      currentPlayerCount: 1,
      createdAt: new Date().toISOString()
    };
    
    // Store player
    players[playerId] = {
      id: playerId,
      name: playerName,
      roomId: roomId,
      position: position
    };
    
    console.log('✅ Created new room', roomId, 'for', playerName, 'as position', position);
    
    res.json({
      success: true,
      roomId: roomId,
      playerId: playerId,
      position: position,
      gameState: 'WAITING',
      message: 'Created new room - waiting for player 2',
      fallbackMode: true,
      mode: 'test'
    });
  }
});

// Room status (local)
app.get('/api/room/status-local', (req, res) => {
  const { roomId, playerId } = req.query;
  console.log('📋 Status check for room:', roomId, 'player:', playerId);
  
  let room = rooms[roomId];
  if (!room) {
    // Auto-create room if not found (Vercel serverless recovery)
    console.log('🔄 Room not found, creating new room:', roomId);
    room = {
      id: roomId,
      players: [],
      gameState: 'WAITING',
      currentTurn: 0,
      guessHistory: [],
      mode: 'test'
    };
    rooms[roomId] = room;
    
    // Add player if provided (but DO NOT auto-generate secret)
    if (playerId) {
      // Check if player already exists
      let existingPlayer = room.players.find(p => p.id === playerId);
      if (!existingPlayer) {
        const newPlayer = {
          id: playerId,
          name: `Player-${playerId.slice(0, 4)}`,
          position: room.players.length + 1,
          secret: null, // No auto-generation! Player must set their own secret
          selectedDigits: null
        };
        room.players.push(newPlayer);
        console.log('✅ Added player without auto-generating secret:', playerId.slice(0, 4));
      }
    }
  } else {
    // Room exists - DO NOT add duplicate players via status check
    // Players should only be added via join-local endpoint
    console.log('✅ Room exists with', room.players.length, 'players, gameState:', room.gameState);
  }
  
  // Prepare response with current turn info
  const response = {
    success: true,
    room: {
      id: roomId,
      gameState: room.gameState,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        ...(p.selectedDigits && { selectedDigits: p.selectedDigits }),
        ...(p.secret && { secret: p.secret })
      })),
      currentPlayerCount: room.players.length,
      currentTurn: room.currentTurn || null // Always include currentTurn field
    },
    mode: 'test'
  };
  
  res.json(response);
});

// Assign turn (local)
app.post('/api/game/assign-turn-local', (req, res) => {
  const { roomId, playerId, turnPlayer } = req.body;
  console.log('🎯 Assign turn request:', { roomId, playerId, turnPlayer });
  
  if (!roomId || !playerId || !turnPlayer) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ 
      success: false, 
      error: 'Room not found' 
    });
  }
  
  // Verify turnPlayer is valid player in room
  const turnPlayerExists = room.players.find(p => p.id === turnPlayer);
  if (!turnPlayerExists) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid turn player' 
    });
  }
  
  // Assign turn
  room.currentTurn = turnPlayer;
  console.log('✅ Turn assigned to:', turnPlayer, 'in room:', roomId);
  
  res.json({
    success: true,
    currentTurn: room.currentTurn,
    message: `Turn assigned to ${turnPlayerExists.name}`
  });
});

// Game state (local)
app.get('/api/game/state-local', (req, res) => {
  const { roomId, playerId } = req.query;
  console.log('🎮 Game state for room:', roomId);
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  res.json({
    success: true,
    gameState: room.gameState,
    currentPlayer: room.currentPlayer || 1,
    turn: room.turn || 1,
    mode: 'test'
  });
});

// Get game history
app.get('/api/game/history-local', (req, res) => {
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing roomId or playerId' 
        });
    }
    
    const room = rooms[roomId];
    if (!room) {
        return res.status(404).json({ 
            success: false, 
            error: 'Room not found' 
        });
    }
    
    const player = room.players.find(p => p.id === playerId);
    if (!player) {
        return res.status(404).json({ 
            success: false, 
            error: 'Player not found' 
        });
    }
    
    // Format history with player names
    const formattedHistory = (room.history || []).map(entry => ({
        playerName: entry.playerName || `Player ${entry.playerId.slice(-4)}`,
        guess: entry.guess,
        bulls: entry.bulls,
        cows: entry.cows,
        timestamp: entry.timestamp
    }));
    
    console.log(`📜 Sending history for room ${roomId}: ${formattedHistory.length} entries`);
    
    res.json({
        success: true,
        history: formattedHistory,
        mode: 'test'
    });
});

// 🎯 INCREMENTAL HISTORY - Only returns new entries since lastEntryIndex
app.get('/api/game/history-incremental', (req, res) => {
    const { roomId, playerId, lastEntryIndex } = req.query;
    
    if (!roomId || !playerId) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing roomId or playerId' 
        });
    }
    
    const room = rooms[roomId];
    if (!room || !room.history) {
        return res.json({
            success: true,
            newEntries: [],
            totalEntries: 0,
            hasNewData: false,
            serverTime: new Date().toISOString()
        });
    }
    
    const lastIndex = parseInt(lastEntryIndex) || -1;
    const newEntries = room.history.slice(lastIndex + 1);
    
    // Format new entries with player names
    const formattedNewEntries = newEntries.map(entry => ({
        playerName: entry.playerName || `Player ${entry.playerId.slice(-4)}`,
        guess: entry.guess,
        bulls: entry.bulls,
        cows: entry.cows,
        timestamp: entry.timestamp
    }));
    
    console.log(`📜 Incremental history: Room ${roomId}, last index: ${lastIndex}, new entries: ${formattedNewEntries.length}`);
    
    // Check for game winner
    let winner = null;
    if (room.gameState === 'FINISHED' && room.winner) {
        winner = {
            playerId: room.winner.playerId,
            playerName: room.winner.playerName || 'Player'
        };
    }
    
    res.json({
        success: true,
        newEntries: formattedNewEntries,
        totalEntries: room.history.length,
        hasNewData: formattedNewEntries.length > 0,
        currentIndex: room.history.length - 1,
        winner: winner,
        gameState: room.gameState,
        serverTime: new Date().toISOString(),
        mode: 'test'
    });
});

// Make a guess
app.post('/api/game/guess-local', (req, res) => {
    const { roomId, playerId, guess } = req.body;
    
    if (!roomId || !playerId || !guess) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields' 
        });
    }
    
    let room = rooms[roomId];
    if (!room) {
        // Auto-create room if not found (Vercel serverless recovery)
        console.log('🔄 Room not found, creating new room for guess:', roomId);
        room = {
            id: roomId,
            players: [],
            gameState: 'WAITING',
            currentTurn: 0,
            guessHistory: [],
            mode: 'test'
        };
        rooms[roomId] = room;
    }
    
    let player = room.players.find(p => p.id === playerId);
    if (!player) {
        return res.status(404).json({ 
            success: false, 
            error: 'Player not found in room' 
        });
    }
    
    // Check if game is in PLAYING state
    if (room.gameState !== 'PLAYING') {
        return res.status(400).json({ 
            success: false, 
            error: `Game is not ready yet. Current state: ${room.gameState}. Please complete digit selection and secret setting first.` 
        });
    }
    
    // Check if player has set their secret
    if (!player.secret) {
        return res.status(400).json({ 
            success: false, 
            error: 'You must set your secret before making guesses' 
        });
    }
    
    // Check if it's player's turn (allow first turn for recovery)
    if (room.currentTurn !== playerId && room.guessHistory.length > 0) {
        return res.status(400).json({ 
            success: false, 
            error: 'Not your turn' 
        });
    }
    
    // Find opponent 
    let opponent = room.players.find(p => p.id !== playerId);
    if (!opponent) {
        return res.status(400).json({ 
            success: false, 
            error: 'Opponent not found. Need 2 players to play.' 
        });
    }
    
    if (!opponent.secret) {
        return res.status(400).json({ 
            success: false, 
            error: 'Opponent has not set their secret yet' 
        });
    }
    
    // Calculate bulls and cows
    const result = calculateBullsAndCows(guess, opponent.secret);
    
    console.log(`🎯 ${player.name} guessed ${guess} vs ${opponent.secret}: ${result.bulls}B ${result.cows}C`);
    
    // Initialize history if needed
    if (!room.history) {
        room.history = [];
    }
    
    // Add to history
    room.history.push({
        playerId: playerId,
        playerName: player.name,
        guess: guess,
        bulls: result.bulls,
        cows: result.cows,
        timestamp: new Date().toISOString()
    });
    
    // Check for win condition
    if (result.bulls === guess.length) {
        // Player won!
        room.gameState = 'FINISHED';
        room.winner = {
            playerId: playerId,
            playerName: player.name,
            timestamp: new Date().toISOString()
        };
        console.log(`🏆 Game finished! Winner: ${player.name} (${playerId})`);
        
        res.json({
            success: true,
            result: {
                guess: parseInt(guess),
                bulls: result.bulls,
                cows: result.cows,
                isCorrect: 1
            },
            gameState: 'FINISHED',
            winner: room.winner,
            mode: 'test'
        });
    } else {
        // Switch turn to opponent
        room.currentTurn = opponent.id;
        
        console.log(`🔄 Turn switched to ${opponent.name} (${opponent.id})`);
        
        res.json({
            success: true,
            result: {
                guess: parseInt(guess),
                bulls: result.bulls,
                cows: result.cows,
                isCorrect: 0
            },
            currentTurn: room.currentTurn,
            mode: 'test'
        });
    }
});

// Get opponent secret for continue guessing mode
app.post('/api/game/opponent-secret', (req, res) => {
  const { roomId, playerId } = req.body;
  console.log('🔍 Opponent secret requested by player:', playerId, 'in room:', roomId);
  
  const room = rooms[roomId];
  if (!room) {
    console.log('❌ Room not found:', roomId);
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  // Verify game is finished
  if (room.gameState !== 'FINISHED') {
    console.log('❌ Game not finished yet. Current state:', room.gameState);
    return res.json({ success: false, error: 'Game not finished yet' });
  }
  
  // Find requester and opponent
  const requester = room.players.find(p => p.id === playerId);
  const opponent = room.players.find(p => p.id !== playerId);
  
  if (!requester) {
    console.log('❌ Requester not found:', playerId);
    return res.json({ success: false, error: 'Player not found' });
  }
  
  if (!opponent) {
    console.log('❌ Opponent not found for player:', playerId);
    return res.json({ success: false, error: 'Opponent not found' });
  }
  
  // Verify requester is not the winner (only losers can request opponent secret)
  if (room.winner && room.winner.playerId === playerId) {
    console.log('❌ Winner cannot request opponent secret:', playerId);
    return res.json({ success: false, error: 'Winner cannot request opponent secret' });
  }
  
  // Check if opponent has a secret
  if (!opponent.secret) {
    console.log('❌ Opponent secret not available');
    return res.json({ success: false, error: 'Opponent secret not available' });
  }
  
  console.log('✅ Returning opponent secret:', opponent.secret, 'for player:', playerId);
  
  // Return opponent's secret
  res.json({
    success: true,
    opponentSecret: opponent.secret,
    opponentPlayerId: opponent.id,
    opponentPlayerName: opponent.playerName || opponent.name || `Player ${opponent.id.substring(0, 6)}`
  });
});

// Select digit (local)
app.post('/api/game/select-digit-local', (req, res) => {
  const { roomId, playerId, digit } = req.body;
  console.log('🔢 Digit selected:', digit, 'from player:', playerId, 'in room:', roomId);
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  // Find player and update their digit selection
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.selectedDigits = digit;
    console.log('✅ Player', player.name, 'selected', digit, 'digits');
  }
  
  // Check if both players have selected digits
  const allPlayersSelected = room.players.every(p => p.selectedDigits);
  if (allPlayersSelected && room.players.length === 2) {
    room.gameState = 'SECRET_SETTING';
    room.currentDigits = digit; // Use the last selected (for simplicity, should be same)
    console.log('🎯 Both players selected digits, moving to SECRET_SETTING');
  }
  
  res.json({
    success: true,
    message: 'Digit selected',
    gameState: room.gameState,
    selectedDigits: digit,
    mode: 'test'
  });
});

// Select digit (new endpoint for iOS)
app.post('/api/game/select-digit', (req, res) => {
  const { roomId, playerId, digits } = req.body;
  console.log('🔢 Digits selected:', digits, 'from player:', playerId, 'in room:', roomId);
  
  // Validate digits range
  if (!digits || digits < 1 || digits > 4) {
    return res.status(400).json({ 
      success: false, 
      error: 'Digits must be between 1 and 4' 
    });
  }
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  if (room.gameState !== 'DIGIT_SELECTION') {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid room state for digit selection' 
    });
  }
  
  // Find player and update their digit selection
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  
  player.selectedDigits = digits;
  console.log('✅ Player', player.name, 'selected', digits, 'digits');
  
  // Check if both players have selected digits
  const allPlayersSelected = room.players.every(p => p.selectedDigits);
  if (allPlayersSelected && room.players.length === 2) {
    // Ensure both players selected the same number of digits
    const player1Digits = room.players[0].selectedDigits;
    const player2Digits = room.players[1].selectedDigits;
    
    if (player1Digits === player2Digits) {
      room.gameState = 'SECRET_SETTING';
      room.currentDigits = player1Digits; // Use the agreed-upon digits
      console.log('🎯 Both players selected', player1Digits, 'digits, moving to SECRET_SETTING');
    } else {
      console.log('❌ Players selected different digits:', player1Digits, 'vs', player2Digits);
      // Keep in DIGIT_SELECTION state until they agree
      return res.status(400).json({
        success: false,
        error: `Both players must select the same number of digits. Player 1: ${player1Digits}, Player 2: ${player2Digits}`,
        gameState: room.gameState
      });
    }
  }
  
  res.json({
    success: true,
    message: 'Digits selected successfully',
    gameState: room.gameState,
    selectedDigits: digits,
    mode: 'test'
  });
});

// Set secret (local)
app.post('/api/game/set-secret-local', (req, res) => {
  const { roomId, playerId, secret } = req.body;
  console.log('🔐 Secret set for player:', playerId, 'in room:', roomId);
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  // Find player and set their secret
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.secret = secret;
    console.log('✅ Player', player.name, 'set secret number');
  }
  
  // Check if both players have set their secrets
  const playersWithSecrets = room.players.filter(p => p.secret);
  if (playersWithSecrets.length === 2) {
    room.gameState = 'PLAYING';
    // Set random first turn
    const firstPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    room.currentTurn = firstPlayer.id;
    console.log('🎮 Both players set secrets, starting game!');
    console.log('🎯 First turn goes to:', firstPlayer.name, '(ID:', firstPlayer.id, ')');
  }
  
  res.json({
    success: true,
    message: 'Secret set successfully',
    mode: 'test'
  });
});

// Set secret (new endpoint for iOS)
app.post('/api/game/set-secret', (req, res) => {
  const { roomId, playerId, secret } = req.body;
  console.log('🔐 Setting secret for player:', playerId, 'in room:', roomId, 'secret:', secret);
  
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  if (room.gameState !== 'SECRET_SETTING') {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid room state for setting secret' 
    });
  }
  
  // Validate secret
  if (!secret) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret is required' 
    });
  }
  
  const requiredDigits = room.currentDigits || 4;
  
  // Check secret length
  if (secret.length !== requiredDigits) {
    return res.status(400).json({ 
      success: false, 
      error: `Secret must be ${requiredDigits} digits` 
    });
  }
  
  // Check if all characters are digits
  if (!/^\d+$/.test(secret)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret must contain only numbers' 
    });
  }
  
  // Check for unique digits
  if (new Set(secret).size !== secret.length) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret cannot have duplicate digits' 
    });
  }
  
  // Find player and set their secret
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  
  player.secret = secret;
  player.isReady = true;
  console.log('✅ Player', player.name, 'set secret:', secret);
  
  // Check if both players have set their secrets
  const playersWithSecrets = room.players.filter(p => p.secret);
  const allReady = playersWithSecrets.length === 2;
  
  console.log(`🔐 Secret status: ${playersWithSecrets.length}/2 players have secrets`);
  room.players.forEach(p => {
    console.log(`   Player ${p.name}: secret=${p.secret ? 'SET' : 'NOT_SET'}`);
  });
  
  if (allReady) {
    room.gameState = 'PLAYING';
    // Set random first turn
    const firstPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    room.currentTurn = firstPlayer.id;
    console.log('🎮 Both players set secrets, starting game!');
    console.log('🎯 First turn goes to:', firstPlayer.name, '(ID:', firstPlayer.id, ')');
  }
  
  res.json({
    success: true,
    gameState: room.gameState,
    yourSecret: secret,
    message: allReady ? 'Game started!' : 'Waiting for other player to set secret',
    mode: 'test'
  });
});

// Leave game (local)
app.post('/api/game/leave-local', (req, res) => {
  const { roomId, playerId } = req.body;
  console.log('👋 Player leaving room:', roomId);
  
  // Clean up
  delete rooms[roomId];
  delete players[playerId];
  
  res.json({
    success: true,
    message: 'Left game',
    mode: 'test'
  });
});

// Fallback for missing endpoints
app.all('/api/*', (req, res) => {
  console.log('❓ Unknown endpoint:', req.method, req.path);
  res.json({
    success: true,
    message: 'Test endpoint',
    mode: 'test'
  });
});

// Export app for Vercel
module.exports = app; 