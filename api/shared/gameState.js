// Enhanced game state management with Vercel-compatible storage
const { getStorageManager } = require('./vercelStorage');

class GameStateManager {
  constructor() {
    this.storageManager = getStorageManager();
    this.initializeStorage();
  }

  initializeStorage() {
    // Legacy global support for immediate access, but main storage is external
    if (!global.gameData) {
      global.gameData = {
        rooms: {},
        players: {},
        lastActivity: Date.now()
      };
    }
  }

  // Get room with external storage support
  async getRoom(roomId) {
    try {
      // Try external storage first
      const room = await this.storageManager.getRoom(roomId);
      if (room) {
        // Cache in memory for fast access
        global.gameData.rooms[roomId] = room;
        return room;
      }
      
      // Fallback to memory
      return global.gameData.rooms[roomId] || null;
    } catch (error) {
      console.error('❌ Failed to get room from storage:', error);
      return global.gameData.rooms[roomId] || null;
    }
  }

  // Create or update room with external storage
  async setRoom(roomId, roomData) {
    const enrichedData = {
      ...roomData,
      lastUpdated: Date.now()
    };

    try {
      // Store in external storage
      await this.storageManager.setRoom(roomId, enrichedData);
      
      // Cache in memory
      global.gameData.rooms[roomId] = enrichedData;
      global.gameData.lastActivity = Date.now();
      
      return enrichedData;
    } catch (error) {
      console.error('❌ Failed to store room:', error);
      // Always store in memory as fallback
      global.gameData.rooms[roomId] = enrichedData;
      return enrichedData;
    }
  }

  // Get player with external storage support
  async getPlayer(playerId) {
    try {
      const player = await this.storageManager.getPlayer(playerId);
      if (player) {
        global.gameData.players[playerId] = player;
        return player;
      }
      
      return global.gameData.players[playerId] || null;
    } catch (error) {
      console.error('❌ Failed to get player from storage:', error);
      return global.gameData.players[playerId] || null;
    }
  }

  // Set player with external storage
  async setPlayer(playerId, playerData) {
    const enrichedData = {
      ...playerData,
      lastUpdated: Date.now()
    };

    try {
      await this.storageManager.setPlayer(playerId, enrichedData);
      global.gameData.players[playerId] = enrichedData;
      return enrichedData;
    } catch (error) {
      console.error('❌ Failed to store player:', error);
      global.gameData.players[playerId] = enrichedData;
      return enrichedData;
    }
  }

  // Enhanced room recovery for serverless environment
  async recoverRoom(roomId, playerId = null) {
    console.log(`🔄 Recovering room: ${roomId} for player: ${playerId}`);
    
    let room = await this.getRoom(roomId);
    
    if (!room) {
      console.log('🆕 Creating new room due to serverless state loss');
      room = {
        id: roomId,
        players: [],
        gameState: 'WAITING',
        currentTurn: null,
        history: [],
        currentDigits: 4,
        mode: 'serverless-recovery',
        recoveryTimestamp: Date.now()
      };
    }

    // Ensure room has required properties
    if (!room.players) room.players = [];
    if (!room.history) room.history = [];
    if (!room.currentDigits) room.currentDigits = 4;

    // Try to recover/add player if provided
    if (playerId && !room.players.find(p => p.id === playerId)) {
      console.log(`👤 Recovering player: ${playerId}`);
      
      // Try to get player data from storage
      let playerData = await this.getPlayer(playerId);
      
      if (!playerData) {
        // Create new player
        playerData = {
          id: playerId,
          name: `Player-${playerId.slice(0, 6)}`,
          position: room.players.length + 1,
          secret: null,
          selectedDigits: null,
          isReady: false,
          recoveryMode: true
        };
        
        await this.setPlayer(playerId, playerData);
      }
      
      room.players.push(playerData);
      console.log(`✅ Player recovered/added: ${playerData.name}`);
    }

    // Store recovered room
    await this.setRoom(roomId, room);
    return room;
  }

  // Validate game state (unchanged)
  validateGameState(room) {
    if (!room) return { valid: false, reason: 'Room not found' };
    if (!room.players) return { valid: false, reason: 'No players array' };
    
    const playerCount = room.players.length;
    const playersWithDigits = room.players.filter(p => p.selectedDigits).length;
    const playersWithSecrets = room.players.filter(p => p.secret).length;
    
    switch (room.gameState) {
      case 'WAITING':
        if (playerCount >= 2) {
          return { valid: false, reason: 'Should progress from WAITING with 2+ players' };
        }
        break;
      case 'DIGIT_SELECTION':
        if (playerCount < 2) {
          return { valid: false, reason: 'Need 2 players for DIGIT_SELECTION' };
        }
        break;
      case 'SECRET_SETTING':
        if (playersWithDigits < 2) {
          return { valid: false, reason: 'Both players must select digits before SECRET_SETTING' };
        }
        break;
      case 'PLAYING':
        if (playersWithSecrets < 2) {
          return { valid: false, reason: 'Both players must set secrets before PLAYING' };
        }
        if (!room.currentTurn) {
          return { valid: false, reason: 'PLAYING state needs currentTurn' };
        }
        break;
    }
    
    return { valid: true };
  }

  // Auto-fix invalid states with serverless awareness
  autoFixGameState(room) {
    const validation = this.validateGameState(room);
    if (validation.valid) return room;
    
    console.log('🔧 Auto-fixing serverless game state:', validation.reason);
    
    const playerCount = room.players.length;
    const playersWithDigits = room.players.filter(p => p.selectedDigits).length;
    const playersWithSecrets = room.players.filter(p => p.secret).length;
    
    // More conservative state fixes for serverless
    if (playerCount < 2) {
      room.gameState = 'WAITING';
    } else if (playersWithDigits < 2) {
      room.gameState = 'DIGIT_SELECTION';
    } else if (playersWithSecrets < 2) {
      room.gameState = 'SECRET_SETTING';
      const digitPlayer = room.players.find(p => p.selectedDigits);
      if (digitPlayer) room.currentDigits = digitPlayer.selectedDigits;
    } else {
      room.gameState = 'PLAYING';
      if (!room.currentTurn) {
        room.currentTurn = room.players[0].id;
      }
    }
    
    // Mark as recovered for client awareness
    room.serverlessRecovery = true;
    
    console.log('✅ Fixed serverless game state to:', room.gameState);
    return room;
  }

  // Enhanced cleanup with external storage awareness
  async cleanup() {
    try {
      // Clean external storage
      await this.storageManager.cleanup();
    } catch (error) {
      console.error('❌ External storage cleanup failed:', error);
    }

    // Clean memory cache
    const now = Date.now();
    const OLD_THRESHOLD = 1800000; // 30 minutes (shorter for serverless)
    
    let roomsRemoved = 0;
    let playersRemoved = 0;
    
    for (const roomId in global.gameData.rooms) {
      const room = global.gameData.rooms[roomId];
      const age = now - (room.lastUpdated || 0);
      
      if (age > OLD_THRESHOLD || !room.players || room.players.length === 0) {
        delete global.gameData.rooms[roomId];
        roomsRemoved++;
      }
    }
    
    for (const playerId in global.gameData.players) {
      const player = global.gameData.players[playerId];
      const age = now - (player.lastUpdated || 0);
      
      if (age > OLD_THRESHOLD) {
        delete global.gameData.players[playerId];
        playersRemoved++;
      }
    }
    
    if (roomsRemoved > 0 || playersRemoved > 0) {
      console.log(`🧹 Serverless cleanup: removed ${roomsRemoved} rooms, ${playersRemoved} players from cache`);
    }
  }

  // Health check for monitoring
  async healthCheck() {
    const storageHealth = await this.storageManager.healthCheck();
    
    return {
      ...storageHealth,
      gameData: {
        rooms: Object.keys(global.gameData.rooms).length,
        players: Object.keys(global.gameData.players).length,
        lastActivity: global.gameData.lastActivity
      },
      serverless: {
        platform: 'vercel',
        coldStart: !global.gameData.lastActivity || (Date.now() - global.gameData.lastActivity) > 300000,
        uptime: Date.now() - (global.gameData.lastActivity || Date.now())
      }
    };
  }
}

// Singleton with serverless awareness
let gameManager;

function getGameManager() {
  if (!gameManager) {
    gameManager = new GameStateManager();
  }
  return gameManager;
}

module.exports = getGameManager(); 