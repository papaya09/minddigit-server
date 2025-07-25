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
  
  const { roomId, playerId, digits } = req.body;
  console.log('🔢 Digits selected:', digits, 'from player:', playerId, 'in room:', roomId);
  
  // Validate digits range
  if (!digits || digits < 2 || digits > 6) {
    return res.status(400).json({ 
      success: false, 
      error: 'Digits must be between 2 and 6' 
    });
  }
  
  global.gameRooms = global.gameRooms || {};
  const room = global.gameRooms[roomId];
  
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
}; 