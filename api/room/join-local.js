// In-memory storage for rooms and players (shared across all functions)
global.gameRooms = global.gameRooms || {};
global.gamePlayers = global.gamePlayers || {};

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
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  const { playerName } = req.body;
  console.log('🚀 Join requested for:', playerName);
  
  const rooms = global.gameRooms;
  const players = global.gamePlayers;
  
  // Find available room
  let availableRoom = null;
  let availableRoomId = null;
  
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.gameState === 'WAITING' && room.currentPlayerCount === 1) {
      availableRoom = room;
      availableRoomId = roomId;
      console.log('🔍 Found available room:', roomId);
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
      secret: null,
      selectedDigits: null
    };
    availableRoom.players.push(newPlayer);
    availableRoom.currentPlayerCount = 2;
    availableRoom.gameState = 'DIGIT_SELECTION';
    
    players[playerId] = {
      id: playerId,
      name: playerName,
      roomId: availableRoomId,
      position: position
    };
    
    console.log('✅ Player', playerName, 'joined room', availableRoomId);
    
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
    
    players[playerId] = {
      id: playerId,
      name: playerName,
      roomId: roomId,
      position: position
    };
    
    console.log('✅ Created new room', roomId, 'for', playerName);
    
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
}; 