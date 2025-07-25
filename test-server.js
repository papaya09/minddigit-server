const express = require('express');
const cors = require('cors');

// Store rooms in memory for local testing
const rooms = {};

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
const PORT = process.env.PORT || 3001;

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

// Simple in-memory storage
let players = {};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

// Generate deterministic secret to prevent changes during serverless restarts
function generateDeterministicSecret(roomId, playerId) {
    // Simple hash function using roomId + playerId as seed
    let hash = 0;
    const input = roomId + playerId + 'secret';
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Ensure positive number and convert to 4-digit string
    hash = Math.abs(hash);
    const secret = (1000 + (hash % 9000)).toString();
    
    // Ensure no duplicate digits for valid game secret
    const digits = secret.split('');
    const uniqueDigits = [...new Set(digits)];
    
    if (uniqueDigits.length === 4) {
        return secret;
    } else {
        // Fallback: create 4 unique digits from hash
        const available = '0123456789';
        let result = '';
        let seedValue = hash;
        
        while (result.length < 4) {
            const index = seedValue % available.length;
            const digit = available[index];
            if (!result.includes(digit)) {
                result += digit;
            }
            seedValue = Math.floor(seedValue / 10) + 1; // Change seed for next iteration
        }
        
        return result;
    }
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
console.log('📱 Local: http://localhost:' + PORT);
console.log('🌐 Network: http://192.168.1.140:' + PORT);
console.log('🧪 Test: http://192.168.1.140:' + PORT + '/api/health');

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
    ip: '192.168.1.140',
    port: PORT,
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
    
    // Add player if provided
    if (playerId) {
      const newPlayer = {
        id: playerId,
        name: `Player-${playerId.slice(0, 4)}`,
        position: room.players.length + 1,
        secret: generateDeterministicSecret(roomId, playerId), // Auto-generate secret immediately
        selectedDigits: null
      };
      room.players.push(newPlayer);
      console.log('🔑 Auto-generated secret for new player:', playerId.slice(0, 4));
    }
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
    
    // Switch turn to opponent
    room.currentTurn = opponent.id;
    
    console.log(`🔄 Turn switched to ${opponent.name} (${opponent.id})`);
    
    res.json({
        success: true,
        result: {
            guess: parseInt(guess),
            bulls: result.bulls,
            cows: result.cows,
            isCorrect: result.bulls === guess.length ? 1 : 0
        },
        currentTurn: room.currentTurn,
        mode: 'test'
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
  if (!digits || digits < 2 || digits > 6) {
    return res.status(400).json({ 
      success: false, 
      error: 'Digits must be between 2 and 6' 
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
    room.gameState = 'SECRET_SETTING';
    room.currentDigits = digits; // Use the selected digits
    console.log('🎯 Both players selected digits, moving to SECRET_SETTING');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ All endpoints ready');
}); 