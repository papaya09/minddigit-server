// Vercel serverless function for getting opponent secret
const gameManager = require('../shared/gameState');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  
  try {
    const { roomId, playerId } = req.body;
    console.log('🔍 Opponent secret requested by player:', playerId, 'in room:', roomId);
    
    if (!roomId || !playerId) {
      return res.status(400).json({ success: false, error: 'Missing roomId or playerId' });
    }
    
    // Get room data from game state
    const room = await gameManager.getRoom(roomId);
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
    
  } catch (error) {
    console.error('❌ Error in opponent-secret API:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error: ' + error.message 
    });
  }
};