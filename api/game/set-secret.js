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
  
  const { roomId, playerId, secret } = req.body;
  console.log('🔐 Setting secret for player:', playerId, 'in room:', roomId, 'secret:', secret);
  
  global.gameRooms = global.gameRooms || {};
  const room = global.gameRooms[roomId];
  
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  
  if (room.gameState !== 'SECRET_SETTING') {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid room state for setting secret' 
    });
  }
  
  // Validate secret
  if (!secret) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret is required' 
    });
  }
  
  const requiredDigits = room.currentDigits || 4;
  
  // Check secret length
  if (secret.length !== requiredDigits) {
    return res.status(400).json({ 
      success: false, 
      error: `Secret must be ${requiredDigits} digits` 
    });
  }
  
  // Check if all characters are digits
  if (!/^\d+$/.test(secret)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret must contain only numbers' 
    });
  }
  
  // Check for unique digits
  if (new Set(secret).size !== secret.length) {
    return res.status(400).json({ 
      success: false, 
      error: 'Secret cannot have duplicate digits' 
    });
  }
  
  // Find player and set their secret
  const player = room.players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ success: false, error: 'Player not found' });
  }
  
  player.secret = secret;
  player.isReady = true;
  console.log('✅ Player', player.name, 'set secret:', secret);
  
  // Check if both players have set their secrets
  const playersWithSecrets = room.players.filter(p => p.secret);
  const allReady = playersWithSecrets.length === 2;
  
  console.log(`🔐 Secret status: ${playersWithSecrets.length}/2 players have secrets`);
  room.players.forEach(p => {
    console.log(`   Player ${p.name}: secret=${p.secret ? 'SET' : 'NOT_SET'}`);
  });
  
  if (allReady) {
    room.gameState = 'PLAYING';
    // Set random first turn
    const firstPlayer = room.players[Math.floor(Math.random() * room.players.length)];
    room.currentTurn = firstPlayer.id;
    console.log('🎮 Both players set secrets, starting game!');
    console.log('🎯 First turn goes to:', firstPlayer.name, '(ID:', firstPlayer.id, ')');
  }
  
  res.json({
    success: true,
    gameState: room.gameState,
    yourSecret: secret,
    message: allReady ? 'Game started!' : 'Waiting for other player to set secret',
    mode: 'test'
  });
}; 