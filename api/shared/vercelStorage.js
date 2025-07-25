// Vercel KV Storage Adapter for Persistent Game State
// This provides external storage to overcome serverless state loss

const crypto = require('crypto');

class VercelStorageManager {
  constructor() {
    this.useKV = false; // Set to true when KV is available
    this.fallbackStorage = new Map(); // In-memory fallback
    this.lastSync = Date.now();
    
    // Initialize KV if available
    this.initializeKV();
  }

  initializeKV() {
    try {
      // Check if Vercel KV is available
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        this.useKV = true;
        console.log('✅ Vercel KV storage available');
      } else {
        console.log('⚠️ Vercel KV not configured, using memory fallback');
      }
    } catch (error) {
      console.log('❌ KV initialization failed:', error.message);
    }
  }

  // Generate deterministic key for game data
  generateKey(type, id) {
    return `minddigit:${type}:${id}`;
  }

  // Store game room with retry mechanism
  async setRoom(roomId, roomData) {
    const key = this.generateKey('room', roomId);
    const data = {
      ...roomData,
      lastUpdated: Date.now(),
      version: this.generateVersion()
    };

    try {
      if (this.useKV) {
        await this.setKV(key, data, 3600); // 1 hour TTL
      } else {
        this.fallbackStorage.set(key, data);
      }
      return data;
    } catch (error) {
      console.error('❌ Failed to store room:', error);
      // Always store in fallback
      this.fallbackStorage.set(key, data);
      return data;
    }
  }

  // Get game room with fallback
  async getRoom(roomId) {
    const key = this.generateKey('room', roomId);

    try {
      if (this.useKV) {
        const data = await this.getKV(key);
        if (data) return data;
      }
      
      // Fallback to memory
      return this.fallbackStorage.get(key) || null;
    } catch (error) {
      console.error('❌ Failed to get room:', error);
      return this.fallbackStorage.get(key) || null;
    }
  }

  // Store player data
  async setPlayer(playerId, playerData) {
    const key = this.generateKey('player', playerId);
    const data = {
      ...playerData,
      lastUpdated: Date.now()
    };

    try {
      if (this.useKV) {
        await this.setKV(key, data, 1800); // 30 minutes TTL
      } else {
        this.fallbackStorage.set(key, data);
      }
      return data;
    } catch (error) {
      console.error('❌ Failed to store player:', error);
      this.fallbackStorage.set(key, data);
      return data;
    }
  }

  // Get player data
  async getPlayer(playerId) {
    const key = this.generateKey('player', playerId);

    try {
      if (this.useKV) {
        const data = await this.getKV(key);
        if (data) return data;
      }
      
      return this.fallbackStorage.get(key) || null;
    } catch (error) {
      console.error('❌ Failed to get player:', error);
      return this.fallbackStorage.get(key) || null;
    }
  }

  // Vercel KV operations with timeout
  async setKV(key, data, ttl = 3600) {
    if (!this.useKV) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const response = await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: JSON.stringify(data),
          ex: ttl
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log('⏰ KV set timeout');
      } else {
        console.error('❌ KV set error:', error);
      }
      return false;
    }
  }

  async getKV(key) {
    if (!this.useKV) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    try {
      const response = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
        headers: {
          'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        return result.result ? JSON.parse(result.result) : null;
      }
      return null;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log('⏰ KV get timeout');
      } else {
        console.error('❌ KV get error:', error);
      }
      return null;
    }
  }

  // Generate version hash for conflict detection
  generateVersion() {
    return crypto.randomBytes(8).toString('hex');
  }

  // Clean up old data
  async cleanup() {
    const now = Date.now();
    const OLD_THRESHOLD = 3600000; // 1 hour

    // Clean memory fallback
    for (const [key, data] of this.fallbackStorage.entries()) {
      if (data.lastUpdated && (now - data.lastUpdated) > OLD_THRESHOLD) {
        this.fallbackStorage.delete(key);
      }
    }

    console.log(`🧹 Cleanup completed: ${this.fallbackStorage.size} items in memory`);
  }

  // Health check
  async healthCheck() {
    const status = {
      timestamp: Date.now(),
      kvAvailable: this.useKV,
      memoryItems: this.fallbackStorage.size,
      uptime: Date.now() - this.lastSync
    };

    if (this.useKV) {
      try {
        const testKey = 'health:test';
        await this.setKV(testKey, { test: true }, 10);
        const result = await this.getKV(testKey);
        status.kvWorking = !!result;
      } catch (error) {
        status.kvWorking = false;
        status.kvError = error.message;
      }
    }

    return status;
  }
}

// Singleton instance
let storageManager;

function getStorageManager() {
  if (!storageManager) {
    storageManager = new VercelStorageManager();
  }
  return storageManager;
}

module.exports = { getStorageManager, VercelStorageManager }; 