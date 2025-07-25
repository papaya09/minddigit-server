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
  
  // Clean up old rooms and players
  cleanup() {
    this.initializeStorage();
    const now = Date.now();
    const OLD_THRESHOLD = 3600000; // 1 hour
    const VERY_OLD_THRESHOLD = 86400000; // 24 hours
    
    let roomsRemoved = 0;
    let playersRemoved = 0;
    
    // 🚨 ENHANCED: More aggressive cleanup for old/broken data
    for (const roomId in global.gameData.rooms) {
      const room = global.gameData.rooms[roomId];
      const age = now - (room.lastUpdated || 0);
      
      // Remove very old rooms immediately
      if (age > VERY_OLD_THRESHOLD) {
        delete global.gameData.rooms[roomId];
        roomsRemoved++;
        continue;
      }
      
      // Remove rooms with corrupted state or excessive history
      if (!room.players || room.players.length === 0 || 
          (room.history && room.history.length > 200)) {
        console.log(`🧹 Removing corrupted/oversized room: ${roomId}`);
        delete global.gameData.rooms[roomId];
        roomsRemoved++;
        continue;
      }
      
      // Remove old inactive rooms
      if (age > OLD_THRESHOLD) {
        delete global.gameData.rooms[roomId];
        roomsRemoved++;
      }
    }
    
    // 🚨 ENHANCED: Clean up orphaned players
    for (const playerId in global.gameData.players) {
      const player = global.gameData.players[playerId];
      const age = now - (player.lastUpdated || 0);
      
      if (age > OLD_THRESHOLD) {
        delete global.gameData.players[playerId];
        playersRemoved++;
      }
    }
    
    // 🚨 NEW: Memory compaction - recreate storage if too much data
    const totalRooms = Object.keys(global.gameData.rooms).length;
    const totalPlayers = Object.keys(global.gameData.players).length;
    
    if (totalRooms > 100 || totalPlayers > 200) {
      console.log('🗜️ Performing memory compaction due to excessive data');
      
      // Keep only recent active data
      const activeRooms = {};
      const activePlayers = {};
      
      for (const roomId in global.gameData.rooms) {
        const room = global.gameData.rooms[roomId];
        if (room.lastUpdated && (now - room.lastUpdated) < OLD_THRESHOLD / 2) {
          activeRooms[roomId] = room;
        }
      }
      
      for (const playerId in global.gameData.players) {
        const player = global.gameData.players[playerId];
        if (player.lastUpdated && (now - player.lastUpdated) < OLD_THRESHOLD / 2) {
          activePlayers[playerId] = player;
        }
      }
      
      global.gameData.rooms = activeRooms;
      global.gameData.players = activePlayers;
    }
    
    if (roomsRemoved > 0 || playersRemoved > 0) {
      console.log(`🧹 Cleanup completed: removed ${roomsRemoved} rooms, ${playersRemoved} players`);
    }
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