import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';

// Simple in-memory storage (resets on each deployment)
interface SimplePlayer {
  playerId: string;
  name: string;
  roomId: string;
  position: number;
  isHost: boolean;
  createdAt: Date;
}

interface SimpleRoom {
  roomId: string;
  players: string[]; // player IDs
  currentPlayerCount: number;
  gameState: 'WAITING' | 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  hostPlayerId: string;
  createdAt: Date;
  isActive: boolean;
}

// Global in-memory storage (simple map)
declare global {
  var simpleRooms: Map<string, SimpleRoom> | undefined;
  var simplePlayers: Map<string, SimplePlayer> | undefined;
}

// Initialize storage
if (!global.simpleRooms) {
  global.simpleRooms = new Map();
  global.simplePlayers = new Map();
}

const rooms = global.simpleRooms!;
const players = global.simplePlayers!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 Simple join process started');
    
    const { playerName } = req.body;
    console.log('📝 Player name:', playerName);
    
    if (!playerName || playerName.trim().length === 0) {
      console.log('❌ Invalid player name');
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Find waiting room
    let waitingRoom: SimpleRoom | undefined;
    for (const room of rooms.values()) {
      if (room.gameState === 'WAITING' && room.currentPlayerCount < 2 && room.isActive) {
        waitingRoom = room;
        break;
      }
    }

    let playerId = uuidv4();
    let position = 1;

    if (waitingRoom) {
      // Join existing room
      position = waitingRoom.currentPlayerCount + 1;
      
      const player: SimplePlayer = {
        playerId,
        name: playerName.trim(),
        roomId: waitingRoom.roomId,
        position,
        isHost: false,
        createdAt: new Date()
      };
      
      players.set(playerId, player);
      waitingRoom.players.push(playerId);
      waitingRoom.currentPlayerCount++;
      waitingRoom.gameState = waitingRoom.currentPlayerCount >= 2 ? 'DIGIT_SELECTION' : 'WAITING';
      
      console.log(`✅ Player ${playerName} joined room ${waitingRoom.roomId} as position ${position}`);
      console.log(`📊 Room now has ${waitingRoom.currentPlayerCount} players, state: ${waitingRoom.gameState}`);
      
      return res.json({
        success: true,
        roomId: waitingRoom.roomId,
        playerId,
        position,
        gameState: waitingRoom.gameState,
        message: 'Joined existing room (simple mode)',
        fallbackMode: true,
        mode: 'simple'
      });
    } else {
      // Create new room
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      console.log('🏗️ Creating new simple room:', roomId);
      
      const player: SimplePlayer = {
        playerId,
        name: playerName.trim(),
        roomId,
        position,
        isHost: true,
        createdAt: new Date()
      };
      
      const room: SimpleRoom = {
        roomId,
        players: [playerId],
        currentPlayerCount: 1,
        gameState: 'WAITING',
        hostPlayerId: playerId,
        createdAt: new Date(),
        isActive: true
      };
      
      players.set(playerId, player);
      rooms.set(roomId, room);
      
      console.log(`🎉 Created new simple room ${roomId} for player ${playerName}`);
      
      return res.json({
        success: true,
        roomId,
        playerId,
        position,
        gameState: 'WAITING',
        message: 'Created new room (simple mode)',
        fallbackMode: true,
        mode: 'simple'
      });
    }
  } catch (error) {
    console.error('💥 Error in simple join:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error)
    });
  }
} 