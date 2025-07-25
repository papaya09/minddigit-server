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
    
    if (!roomId || !playerId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing roomId or playerId parameters'
      });
    }
    
    console.log(`📜 History request for room ${roomId}, player ${playerId.slice(0, 4)}`);
    
    // Get room with auto-recovery
    let room = gameManager.recoverRoom(roomId, playerId);
    
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
        error: 'Player not found in room'
      });
    }
    
    // Ensure history array exists
    if (!room.history) {
      room.history = [];
      console.log('📜 Initialized empty history for room:', roomId);
    }
    
    // Format history with enhanced information
    const formattedHistory = room.history.map((entry, index) => {
      const playerName = entry.playerName || `Player ${entry.playerId?.slice(-4) || 'Unknown'}`;
      const isCurrentPlayer = entry.playerId === playerId;
      
      return {
        turn: entry.turn || (index + 1),
        playerName: playerName,
        playerId: entry.playerId,
        guess: entry.guess,
        bulls: entry.bulls || 0,
        cows: entry.cows || 0,
        timestamp: entry.timestamp || new Date().toISOString(),
        isYou: isCurrentPlayer,
        result: `${entry.bulls || 0}B ${entry.cows || 0}C`
      };
    });
    
    // Sort by turn order to ensure consistency
    formattedHistory.sort((a, b) => (a.turn || 0) - (b.turn || 0));
    
    console.log(`📜 Sending ${formattedHistory.length} history entries for room ${roomId}`);
    
    // Enhanced response with game state info
    const response = {
      success: true,
      history: formattedHistory,
      meta: {
        totalEntries: formattedHistory.length,
        roomId: roomId,
        gameState: room.gameState,
        currentTurn: room.currentTurn,
        isYourTurn: room.currentTurn === playerId,
        lastUpdated: room.lastUpdated || Date.now(),
        serverTime: Date.now()
      },
      mode: 'test'
    };
    
    // Add game progress information
    if (room.gameState === 'PLAYING' || room.gameState === 'FINISHED') {
      const playerGuesses = formattedHistory.filter(h => h.playerId === playerId).length;
      const opponentGuesses = formattedHistory.filter(h => h.playerId !== playerId).length;
      
      response.meta.yourGuesses = playerGuesses;
      response.meta.opponentGuesses = opponentGuesses;
      response.meta.totalGuesses = formattedHistory.length;
    }
    
    // Add winner information if game is finished
    if (room.gameState === 'FINISHED' && room.winner) {
      response.meta.winner = room.winnerName || room.winner;
      response.meta.isWinner = room.winner === playerId;
      response.meta.gameFinished = true;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ History retrieval error:', error);
    
    // Return safe fallback response
    res.status(200).json({
      success: true,
      history: [], // Empty history as fallback
      meta: {
        totalEntries: 0,
        roomId: req.query.roomId || 'unknown',
        error: 'History temporarily unavailable',
        recovered: true,
        serverTime: Date.now()
      },
      mode: 'test'
    });
  }
}; 