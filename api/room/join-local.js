const gameManager = require('../shared/gameState');

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generatePlayerId() {
  return Math.random().toString(36).substring(2, 10);
}

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  try {
    const { playerName } = req.body;
    
    if (!playerName || playerName.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Player name is required'
      });
    }
    
    console.log('🚀 Join requested for:', playerName);
    
    // Clean up old data periodically
    if (Math.random() < 0.1) {
      gameManager.cleanup();
    }
    
    // Find available room
    let availableRoom = null;
    let availableRoomId = null;
    
    // Get all rooms and find available ones
    const allRooms = Object.keys(global.gameData?.rooms || {});
    for (const roomId of allRooms) {
      const room = gameManager.getRoom(roomId);
      if (room && room.gameState === 'WAITING' && room.players.length === 1) {
        availableRoom = room;
        availableRoomId = roomId;
        console.log('🔍 Found available room:', roomId);
        break;
      }
    }
    
    const playerId = generatePlayerId();
    const playerData = {
      name: playerName.trim(),
      joinedAt: Date.now()
    };
    
    if (availableRoom) {
      // Join existing room as player 2
      const position = 2;
      const newPlayer = { 
        id: playerId, 
        name: playerName.trim(), 
        position: position,
        secret: null,
        selectedDigits: null,
        isReady: false,
        joinedAt: Date.now()
      };
      
      availableRoom.players.push(newPlayer);
      availableRoom.gameState = 'DIGIT_SELECTION';
      availableRoom.lastUpdated = Date.now();
      
      // Update room and player in storage
      gameManager.setRoom(availableRoomId, availableRoom);
      gameManager.setPlayer(playerId, {
        ...playerData,
        roomId: availableRoomId,
        position: position
      });
      
      console.log('✅ Player', playerName, 'joined room', availableRoomId);
      
      res.json({
        success: true,
        roomId: availableRoomId,
        playerId: playerId,
        position: position,
        gameState: 'DIGIT_SELECTION',
        message: 'Joined existing room - ready to select digits!',
        nextAction: 'SELECT_DIGITS',
        serverTime: Date.now(),
        fallbackMode: true,
        mode: 'test'
      });
      
    } else {
      // Create new room as player 1
      const roomId = generateRoomId();
      const position = 1;
      
      const newRoom = {
        id: roomId,
        players: [{ 
          id: playerId, 
          name: playerName.trim(), 
          position: position,
          secret: null,
          selectedDigits: null,
          isReady: false,
          joinedAt: Date.now()
        }],
        gameState: 'WAITING',
        currentPlayerCount: 1,
        currentTurn: null,
        history: [],
        currentDigits: 4,
        createdAt: new Date().toISOString(),
        mode: 'test'
      };
      
      // Store room and player
      gameManager.setRoom(roomId, newRoom);
      gameManager.setPlayer(playerId, {
        ...playerData,
        roomId: roomId,
        position: position
      });
      
      console.log('✅ Created new room', roomId, 'for', playerName);
      
      res.json({
        success: true,
        roomId: roomId,
        playerId: playerId,
        position: position,
        gameState: 'WAITING',
        message: 'Created new room - waiting for player 2',
        nextAction: 'WAIT_FOR_PLAYER',
        serverTime: Date.now(),
        fallbackMode: true,
        mode: 'test'
      });
    }
    
  } catch (error) {
    console.error('❌ Join room error:', error);
    
    // Return graceful error instead of 500
    res.status(200).json({
      success: false,
      error: 'Unable to join room at this time. Please try again.',
      details: error.message,
      serverTime: Date.now(),
      mode: 'test'
    });
  }
}; 