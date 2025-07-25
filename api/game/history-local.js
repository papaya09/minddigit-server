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
  
  if (!roomId || !playerId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing roomId or playerId' 
    });
  }
  
  global.gameRooms = global.gameRooms || {};
  const room = global.gameRooms[roomId];
  
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
}; 