// Access global storage
const rooms = () => global.gameRooms || {};
const players = () => global.gamePlayers || {};

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  const { roomId, playerId } = req.query;
  console.log('📋 Status check for room:', roomId, 'player:', playerId);
  
  global.gameRooms = global.gameRooms || {};
  global.gamePlayers = global.gamePlayers || {};
  
  let room = global.gameRooms[roomId];
  if (!room) {
    // Auto-create room if not found (serverless recovery)
    console.log('🔄 Room not found, creating new room:', roomId);
    room = {
      id: roomId,
      players: [],
      gameState: 'WAITING',
      currentTurn: 0,
      guessHistory: [],
      mode: 'test'
    };
    global.gameRooms[roomId] = room;
    
    // Add player if provided (but DO NOT auto-generate secret)
    if (playerId) {
      let existingPlayer = room.players.find(p => p.id === playerId);
      if (!existingPlayer) {
        const newPlayer = {
          id: playerId,
          name: `Player-${playerId.slice(0, 4)}`,
          position: room.players.length + 1,
          secret: null, // No auto-generation!
          selectedDigits: null
        };
        room.players.push(newPlayer);
        console.log('✅ Added player without auto-generating secret:', playerId.slice(0, 4));
      }
    }
  } else {
    // Room exists - check if player needs to be added
    if (playerId && !room.players.find(p => p.id === playerId)) {
      const newPlayer = {
        id: playerId,
        name: `Player-${playerId.slice(0, 4)}`,
        position: room.players.length + 1,
        secret: null, // No auto-generation!
        selectedDigits: null
      };
      room.players.push(newPlayer);
      console.log('✅ Added missing player without auto-generating secret:', playerId.slice(0, 4));
    }
  }
  
  // Prepare response
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
      currentTurn: room.currentTurn || null
    },
    mode: 'test'
  };
  
  res.json(response);
}; 