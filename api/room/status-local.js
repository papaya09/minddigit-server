const gameManager = require('../shared/gameState');

module.exports = (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  try {
    const { roomId, playerId } = req.query;
    
    if (!roomId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing roomId parameter' 
      });
    }
    
    console.log('📋 Status check for room:', roomId, 'player:', playerId);
    
    // Clean up old data periodically
    if (Math.random() < 0.1) { // 10% chance
      gameManager.cleanup();
    }
    
    // Try to recover room with fallback data if needed
    let room = gameManager.recoverRoom(roomId, playerId);
    
    // Auto-fix any invalid game states
    room = gameManager.autoFixGameState(room);
    
    // Update room in storage
    gameManager.setRoom(roomId, room);
    
    // Store player data for recovery
    if (playerId) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        gameManager.setPlayer(playerId, {
          ...player,
          roomId: roomId,
          lastSeen: Date.now()
        });
      }
    }
    
    // Prepare enhanced response with state validation
    const validation = gameManager.validateGameState(room);
    const response = {
      success: true,
      room: {
        id: roomId,
        gameState: room.gameState,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          isReady: p.isReady || false,
          ...(p.selectedDigits && { selectedDigits: p.selectedDigits }),
          ...(p.secret && { secret: p.secret })
        })),
        currentPlayerCount: room.players.length,
        currentTurn: room.currentTurn || null,
        currentDigits: room.currentDigits || 4,
        ...(room.history && { historyCount: room.history.length })
      },
      validation: validation,
      serverTime: Date.now(),
      mode: 'test'
    };
    
    // Add state-specific guidance
    if (!validation.valid) {
      response.suggestion = `Game state issue: ${validation.reason}. Auto-recovery attempted.`;
    }
    
    // Add transition hints for client
    switch (room.gameState) {
      case 'WAITING':
        response.nextAction = room.players.length < 2 ? 'WAIT_FOR_PLAYER' : 'START_DIGIT_SELECTION';
        break;
      case 'DIGIT_SELECTION':
        response.nextAction = 'SELECT_DIGITS';
        break;
      case 'SECRET_SETTING':
        response.nextAction = 'SET_SECRET';
        break;
      case 'PLAYING':
        response.nextAction = 'MAKE_GUESS';
        break;
    }
    
    console.log('✅ Status response:', response.room.gameState, 'players:', response.room.currentPlayerCount);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Status check error:', error);
    
    // Fallback response to prevent complete failure
    res.status(200).json({
      success: true,
      room: {
        id: req.query.roomId || 'unknown',
        gameState: 'WAITING',
        players: [],
        currentPlayerCount: 0,
        currentTurn: null,
        currentDigits: 4
      },
      error: 'Recovered from server error',
      serverTime: Date.now(),
      mode: 'test'
    });
  }
}; 