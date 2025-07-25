// Ultra-lightweight quick status for 200ms polling
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

  const startTime = Date.now();
  
  try {
    const { roomId, playerId, lastUpdate } = req.query;
    
    if (!roomId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing roomId' 
      });
    }

    // Get room with minimal overhead
    let room = await gameManager.getRoom(roomId);
    
    if (!room) {
      return res.status(200).json({
        success: true,
        room: {
          gameState: 'WAITING',
          currentTurn: null,
          historyCount: 0
        },
        responseTime: Date.now() - startTime
      });
    }

    // Return only essential data for quick updates
    const quickData = {
      success: true,
      room: {
        gameState: room.gameState,
        currentTurn: room.currentTurn || null,
        historyCount: room.history ? room.history.length : 0,
        playerCount: room.players ? room.players.length : 0
      },
      responseTime: Date.now() - startTime,
      serverTime: Date.now()
    };

    // Add turn-specific info if player is provided
    if (playerId) {
      const player = room.players ? room.players.find(p => p.id === playerId) : null;
      if (player) {
        quickData.playerInfo = {
          isYourTurn: room.currentTurn === playerId,
          hasSecret: !!player.secret,
          position: player.position || 0
        };
      }
    }

    // Performance optimization: Set short cache for ultra-fast requests
    res.setHeader('Cache-Control', 'public, max-age=1'); // 1 second cache
    
    res.status(200).json(quickData);
    
  } catch (error) {
    console.error('❌ Quick status error:', error);
    
    // Return minimal error response to keep client running
    res.status(200).json({
      success: false,
      error: 'Quick check failed',
      room: {
        gameState: 'WAITING',
        currentTurn: null,
        historyCount: 0
      },
      responseTime: Date.now() - startTime
    });
  }
}; 