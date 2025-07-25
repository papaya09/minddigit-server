const gameManager = require('../shared/gameState');

module.exports = async (req, res) => {
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

  const startTime = Date.now();
  
  try {
    const { roomId, playerId } = req.query;
    
    if (!roomId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing roomId parameter' 
      });
    }

    console.log('📋 Status check for room:', roomId, 'player:', playerId);
    
    // Periodic cleanup with lower frequency for serverless
    if (Math.random() < 0.05) { // 5% chance
      await gameManager.cleanup();
    }

    // Try to recover room with fallback data if needed
    let room = await gameManager.recoverRoom(roomId, playerId);
    
    // Auto-fix any invalid game states
    room = gameManager.autoFixGameState(room);
    
    // Update room in storage (async)
    await gameManager.setRoom(roomId, room);
    
    // Store player data for recovery
    if (playerId) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        await gameManager.setPlayer(playerId, {
          ...player,
          roomId: roomId,
          lastSeen: Date.now()
        });
      }
    }
    
    // Prepare enhanced response with state validation
    const validation = gameManager.validateGameState(room);
    const responseTime = Date.now() - startTime;
    
    // Enhanced response with serverless awareness
    const response = {
      success: true,
      room: {
        ...room,
        responseTime,
        serverless: {
          platform: 'vercel',
          coldStart: responseTime > 3000,
          region: process.env.VERCEL_REGION || 'unknown'
        }
      },
      validation: {
        valid: validation.valid,
        reason: validation.reason || null
      },
      serverTime: Date.now(),
      nextAction: determineNextAction(room, playerId),
      playerInfo: getPlayerInfo(room, playerId)
    };
    
    // Add recovery indicators
    if (room.serverlessRecovery) {
      response.recovery = {
        detected: true,
        message: 'Game state was recovered from serverless restart',
        timestamp: room.recoveryTimestamp
      };
    }
    
    // Add performance warnings for client optimization
    if (responseTime > 2000) {
      response.performance = {
        warning: 'Slow response detected',
        responseTime,
        suggestion: 'Consider reducing polling frequency'
      };
    }

    console.log(`✅ Status response: ${room.gameState} in ${responseTime}ms`);
    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Status check error:', error);
    
    const responseTime = Date.now() - startTime;
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      serverTime: Date.now(),
      responseTime,
      recovery: {
        suggestion: 'Try refreshing the game state',
        endpoint: '/api/health?warm=true'
      }
    });
  }
};

// Helper function to determine next action for client
function determineNextAction(room, playerId) {
  if (!room || !playerId) return 'wait';
  
  const player = room.players.find(p => p.id === playerId);
  if (!player) return 'rejoin';
  
  switch (room.gameState) {
    case 'WAITING':
      return room.players.length < 2 ? 'wait_for_players' : 'start_digit_selection';
    case 'DIGIT_SELECTION':
      return player.selectedDigits ? 'wait_for_others' : 'select_digits';
    case 'SECRET_SETTING':
      return player.secret ? 'wait_for_others' : 'set_secret';
    case 'PLAYING':
      return room.currentTurn === playerId ? 'make_guess' : 'wait_for_turn';
    case 'FINISHED':
      return 'game_over';
    default:
      return 'unknown';
  }
}

// Helper function to get player-specific info
function getPlayerInfo(room, playerId) {
  if (!room || !playerId) return null;
  
  const player = room.players.find(p => p.id === playerId);
  if (!player) return null;
  
  const opponent = room.players.find(p => p.id !== playerId);
  
  return {
    self: {
      id: player.id,
      name: player.name,
      position: player.position,
      hasSelectedDigits: !!player.selectedDigits,
      hasSecret: !!player.secret,
      isReady: !!player.isReady
    },
    opponent: opponent ? {
      id: opponent.id,
      name: opponent.name,
      hasSelectedDigits: !!opponent.selectedDigits,
      hasSecret: !!opponent.secret,
      isReady: !!opponent.isReady
    } : null,
    gameInfo: {
      isYourTurn: room.currentTurn === playerId,
      currentDigits: room.currentDigits,
      totalMoves: room.history ? room.history.length : 0
    }
  };
} 