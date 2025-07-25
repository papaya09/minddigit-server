// Bulls and Cows calculation function
function calculateBullsAndCows(guess, secret) {
    let bulls = 0;
    let cows = 0;
    
    const guessArray = guess.split('');
    const secretArray = secret.split('');
    
    // Count bulls (correct digit in correct position)
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] === secretArray[i]) {
            bulls++;
            guessArray[i] = null;
            secretArray[i] = null;
        }
    }
    
    // Count cows (correct digit in wrong position)
    for (let i = 0; i < guessArray.length; i++) {
        if (guessArray[i] !== null) {
            const secretIndex = secretArray.indexOf(guessArray[i]);
            if (secretIndex !== -1) {
                cows++;
                secretArray[secretIndex] = null;
            }
        }
    }
    
    return { bulls, cows };
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
  
  const { roomId, playerId, guess } = req.body;
  
  if (!roomId || !playerId || !guess) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }
  
  global.gameRooms = global.gameRooms || {};
  let room = global.gameRooms[roomId];
  
  if (!room) {
    // Auto-create room if not found (serverless recovery)
    console.log('🔄 Room not found, creating new room for guess:', roomId);
    room = {
      id: roomId,
      players: [],
      gameState: 'WAITING',
      currentTurn: 0,
      guessHistory: [],
      mode: 'test'
    };
    global.gameRooms[roomId] = room;
  }
  
  let player = room.players.find(p => p.id === playerId);
  if (!player) {
    return res.status(404).json({ 
      success: false, 
      error: 'Player not found in room' 
    });
  }
  
  // Check if game is in PLAYING state
  if (room.gameState !== 'PLAYING') {
    return res.status(400).json({ 
      success: false, 
      error: `Game is not ready yet. Current state: ${room.gameState}. Please complete digit selection and secret setting first.` 
    });
  }
  
  // Check if player has set their secret
  if (!player.secret) {
    return res.status(400).json({ 
      success: false, 
      error: 'You must set your secret before making guesses' 
    });
  }
  
  // Check if it's player's turn (allow first turn for recovery)
  if (room.currentTurn !== playerId && room.guessHistory && room.guessHistory.length > 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Not your turn' 
    });
  }
  
  // Find opponent 
  let opponent = room.players.find(p => p.id !== playerId);
  if (!opponent) {
    return res.status(400).json({ 
      success: false, 
      error: 'Opponent not found. Need 2 players to play.' 
    });
  }
  
  if (!opponent.secret) {
    return res.status(400).json({ 
      success: false, 
      error: 'Opponent has not set their secret yet' 
    });
  }
  
  // Calculate bulls and cows
  const result = calculateBullsAndCows(guess, opponent.secret);
  
  console.log(`🎯 ${player.name} guessed ${guess} vs ${opponent.secret}: ${result.bulls}B ${result.cows}C`);
  
  // Initialize history if needed
  if (!room.history) {
    room.history = [];
  }
  
  // Add to history
  room.history.push({
    playerId: playerId,
    playerName: player.name,
    guess: guess,
    bulls: result.bulls,
    cows: result.cows,
    timestamp: new Date().toISOString()
  });
  
  // Switch turn to opponent
  room.currentTurn = opponent.id;
  
  console.log(`🔄 Turn switched to ${opponent.name} (${opponent.id})`);
  
  res.json({
    success: true,
    result: {
      guess: parseInt(guess),
      bulls: result.bulls,
      cows: result.cows,
      isCorrect: result.bulls === guess.length ? 1 : 0
    },
    currentTurn: room.currentTurn,
    mode: 'test'
  });
}; 