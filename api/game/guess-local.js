const gameManager = require('../shared/gameState');

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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }
  
  try {
    const { roomId, playerId, guess } = req.body;
    
    if (!roomId || !playerId || !guess) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: roomId, playerId, and guess are required' 
      });
    }
    
    console.log('🎯 Guess attempt:', { roomId, playerId, guess });
    
    // Get room with auto-recovery
    let room = gameManager.recoverRoom(roomId, playerId);
    
    // Auto-fix game state if needed
    room = gameManager.autoFixGameState(room);
    
    // Validate game state before processing guess
    const validation = gameManager.validateGameState(room);
    if (!validation.valid) {
      console.log('⚠️ Invalid game state:', validation.reason);
      
      // Try to recover by auto-fixing again
      room = gameManager.autoFixGameState(room);
      const newValidation = gameManager.validateGameState(room);
      
      if (!newValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: `Game state error: ${newValidation.reason}`,
          currentState: room.gameState,
          suggestion: 'Please wait for other players to complete setup',
          recovery: true,
          serverTime: Date.now()
        });
      }
    }
    
    let player = room.players.find(p => p.id === playerId);
    if (!player) {
      return res.status(404).json({ 
        success: false, 
        error: 'Player not found in room',
        roomState: room.gameState
      });
    }
    
    // Check if game is in PLAYING state
    if (room.gameState !== 'PLAYING') {
      // Provide specific guidance based on current state
      let guidance = '';
      switch (room.gameState) {
        case 'WAITING':
          guidance = 'Waiting for second player to join';
          break;
        case 'DIGIT_SELECTION':
          guidance = 'Please select number of digits first';
          break;
        case 'SECRET_SETTING':
          guidance = 'Please set your secret number first';
          break;
        default:
          guidance = 'Game setup not complete';
      }
      
      return res.status(400).json({ 
        success: false, 
        error: `Game is not ready for guesses. Current state: ${room.gameState}`,
        guidance: guidance,
        currentState: room.gameState,
        playersReady: room.players.filter(p => p.secret).length,
        totalPlayers: room.players.length,
        serverTime: Date.now()
      });
    }
    
    // Check if player has set their secret
    if (!player.secret) {
      return res.status(400).json({ 
        success: false, 
        error: 'You must set your secret before making guesses',
        currentState: room.gameState,
        needsSecret: true
      });
    }
    
    // Find opponent 
    let opponent = room.players.find(p => p.id !== playerId);
    if (!opponent || !opponent.secret) {
      return res.status(400).json({ 
        success: false, 
        error: 'Opponent is not ready yet',
        currentState: room.gameState,
        opponentReady: !!opponent?.secret
      });
    }
    
    // Check if it's player's turn (allow first turn for recovery)
    const hasHistory = room.history && room.history.length > 0;
    if (room.currentTurn !== playerId && hasHistory) {
      return res.status(400).json({ 
        success: false, 
        error: 'Not your turn',
        currentTurn: room.currentTurn,
        yourTurn: false,
        serverTime: Date.now()
      });
    }
    
    // Validate guess format
    const guessStr = guess.toString();
    const expectedLength = room.currentDigits || 4;
    
    if (guessStr.length !== expectedLength) {
      return res.status(400).json({
        success: false,
        error: `Guess must be ${expectedLength} digits`,
        guessLength: guessStr.length,
        expectedLength: expectedLength
      });
    }
    
    if (!/^\d+$/.test(guessStr)) {
      return res.status(400).json({
        success: false,
        error: 'Guess must contain only numbers'
      });
    }
    
    if (new Set(guessStr).size !== guessStr.length) {
      return res.status(400).json({
        success: false,
        error: 'Guess cannot have duplicate digits'
      });
    }
    
    // Calculate bulls and cows
    const result = calculateBullsAndCows(guessStr, opponent.secret);
    
    console.log(`🎯 ${player.name} guessed ${guessStr} vs ${opponent.secret}: ${result.bulls}B ${result.cows}C`);
    
    // Initialize history if needed
    if (!room.history) {
      room.history = [];
    }
    
    // Add to history
    const historyEntry = {
      playerId: playerId,
      playerName: player.name,
      guess: guessStr,
      bulls: result.bulls,
      cows: result.cows,
      timestamp: new Date().toISOString(),
      turn: room.history.length + 1
    };
    
    room.history.push(historyEntry);
    
    // Check for win condition
    const isWin = result.bulls === guessStr.length;
    if (isWin) {
      room.gameState = 'FINISHED';
      room.winner = playerId;
      room.winnerName = player.name;
    } else {
      // Switch turn to opponent
      room.currentTurn = opponent.id;
    }
    
    // Update room in storage
    gameManager.setRoom(roomId, room);
    
    console.log(`🔄 Turn result: ${isWin ? 'WIN!' : `switched to ${opponent.name}`}`);
    
    res.json({
      success: true,
      result: {
        guess: parseInt(guessStr),
        bulls: result.bulls,
        cows: result.cows,
        isCorrect: isWin ? 1 : 0,
        isWin: isWin
      },
      currentTurn: room.currentTurn,
      gameState: room.gameState,
      historyCount: room.history.length,
      ...(isWin && { winner: room.winnerName }),
      serverTime: Date.now(),
      mode: 'test'
    });
    
  } catch (error) {
    console.error('❌ Guess processing error:', error);
    
    // Return recoverable error
    res.status(200).json({
      success: false,
      error: 'Unable to process guess at this time. Please try again.',
      details: error.message,
      recoverable: true,
      serverTime: Date.now(),
      mode: 'test'
    });
  }
}; 