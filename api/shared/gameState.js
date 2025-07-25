// Shared game state management with persistence
class GameStateManager {
  constructor() {
    this.initializeStorage();
  }
  
  initializeStorage() {
    // Use global object for immediate access, but also prepare for external storage
    if (!global.gameData) {
      global.gameData = {
        rooms: {},
        players: {},
        lastActivity: Date.now()
      };
    }
  }
  
  // Get room with auto-recovery
  getRoom(roomId) {
    this.initializeStorage();
    return global.gameData.rooms[roomId] || null;
  }
  
  // Create or update room
  setRoom(roomId, roomData) {
    this.initializeStorage();
    global.gameData.rooms[roomId] = {
      ...roomData,
      lastUpdated: Date.now()
    };
    global.gameData.lastActivity = Date.now();
    return global.gameData.rooms[roomId];
  }
  
  // Get player
  getPlayer(playerId) {
    this.initializeStorage();
    return global.gameData.players[playerId] || null;
  }
  
  // Set player
  setPlayer(playerId, playerData) {
    this.initializeStorage();
    global.gameData.players[playerId] = {
      ...playerData,
      lastUpdated: Date.now()
    };
    return global.gameData.players[playerId];
  }
  
  // Auto-recover room if needed
  recoverRoom(roomId, playerId, fallbackData = {}) {
    let room = this.getRoom(roomId);
    
    if (!room) {
      console.log('🔄 Auto-recovering room:', roomId);
      room = {
        id: roomId,
        players: [],
        gameState: 'WAITING',
        currentTurn: null,
        history: [],
        currentDigits: 4,
        mode: 'test',
        createdAt: new Date().toISOString(),
        ...fallbackData
      };
      this.setRoom(roomId, room);
    }
    
    // Ensure player exists in room
    if (playerId && !room.players.find(p => p.id === playerId)) {
      const playerData = this.getPlayer(playerId) || {};
      const newPlayer = {
        id: playerId,
        name: playerData.name || `Player-${playerId.slice(0, 4)}`,
        position: room.players.length + 1,
        secret: null,
        selectedDigits: null,
        isReady: false,
        ...playerData
      };
      room.players.push(newPlayer);
      this.setRoom(roomId, room);
      console.log('✅ Auto-added player to recovered room:', playerId.slice(0, 4));
    }
    
    return room;
  }
  
  // Clean old data
  cleanup() {
    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    // Clean old rooms
    Object.keys(global.gameData.rooms).forEach(roomId => {
      const room = global.gameData.rooms[roomId];
      if (now - (room.lastUpdated || 0) > TIMEOUT) {
        delete global.gameData.rooms[roomId];
        console.log('🧹 Cleaned up old room:', roomId);
      }
    });
    
    // Clean old players
    Object.keys(global.gameData.players).forEach(playerId => {
      const player = global.gameData.players[playerId];
      if (now - (player.lastUpdated || 0) > TIMEOUT) {
        delete global.gameData.players[playerId];
        console.log('🧹 Cleaned up old player:', playerId.slice(0, 4));
      }
    });
  }
  
  // Validate game state
  validateGameState(room) {
    if (!room) return { valid: false, reason: 'Room not found' };
    
    // Check minimum requirements for each state
    switch (room.gameState) {
      case 'WAITING':
        return { valid: true };
        
      case 'DIGIT_SELECTION':
        if (room.players.length < 2) {
          return { valid: false, reason: 'Need 2 players for digit selection' };
        }
        return { valid: true };
        
      case 'SECRET_SETTING':
        const hasDigits = room.players.every(p => p.selectedDigits);
        if (!hasDigits) {
          return { valid: false, reason: 'All players must select digits first' };
        }
        return { valid: true };
        
      case 'PLAYING':
        const hasSecrets = room.players.every(p => p.secret);
        if (!hasSecrets) {
          return { valid: false, reason: 'All players must set secrets first' };
        }
        if (!room.currentTurn) {
          return { valid: false, reason: 'No current turn assigned' };
        }
        return { valid: true };
        
      default:
        return { valid: false, reason: 'Invalid game state' };
    }
  }
  
  // Auto-fix invalid states
  autoFixGameState(room) {
    const validation = this.validateGameState(room);
    if (validation.valid) return room;
    
    console.log('🔧 Auto-fixing game state:', validation.reason);
    
    // Auto-fix logic based on current situation
    const playerCount = room.players.length;
    const playersWithDigits = room.players.filter(p => p.selectedDigits).length;
    const playersWithSecrets = room.players.filter(p => p.secret).length;
    
    if (playerCount < 2) {
      room.gameState = 'WAITING';
    } else if (playersWithDigits < 2) {
      room.gameState = 'DIGIT_SELECTION';
    } else if (playersWithSecrets < 2) {
      room.gameState = 'SECRET_SETTING';
      // Set currentDigits from any player who selected
      const digitPlayer = room.players.find(p => p.selectedDigits);
      if (digitPlayer) room.currentDigits = digitPlayer.selectedDigits;
    } else {
      room.gameState = 'PLAYING';
      // Assign turn if missing
      if (!room.currentTurn) {
        room.currentTurn = room.players[0].id;
      }
    }
    
    console.log('✅ Fixed game state to:', room.gameState);
    return room;
  }
}

// Singleton instance
const gameManager = new GameStateManager();

module.exports = gameManager; 