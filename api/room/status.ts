import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';

// In-memory fallback storage (shared with join.ts)
interface InMemoryPlayer {
  playerId: string;
  name: string;
  roomId: string;
  position: number;
  isHost: boolean;
  createdAt: Date;
}

interface InMemoryRoom {
  roomId: string;
  players: string[];
  currentPlayerCount: number;
  gameState: 'WAITING' | 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  hostPlayerId: string;
  createdAt: Date;
  isActive: boolean;
}

// Global in-memory storage
declare global {
  var memoryRooms: Map<string, InMemoryRoom> | undefined;
  var memoryPlayers: Map<string, InMemoryPlayer> | undefined;
}

// Initialize if not exists
if (!global.memoryRooms) {
  global.memoryRooms = new Map();
  global.memoryPlayers = new Map();
}

const memoryRooms = global.memoryRooms!;
const memoryPlayers = global.memoryPlayers!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Checking room status...');
    
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      console.log('❌ Missing roomId or playerId');
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    // Try database first
    let databaseConnected = false;
    try {
      await connectToDatabase();
      console.log('✅ Database connected for status check');
      databaseConnected = true;
    } catch (dbError) {
      console.error('❌ Database connection failed, using memory fallback');
      databaseConnected = false;
    }

    if (!databaseConnected) {
      // Use in-memory storage
      console.log('🧠 Using in-memory storage for status check');
      
      const room = memoryRooms.get(roomId as string);
      if (!room || !room.isActive) {
        console.log('❌ Room not found in memory');
        return res.status(404).json({ error: 'Room not found' });
      }

      const player = memoryPlayers.get(playerId as string);
      if (!player || player.roomId !== roomId) {
        console.log('❌ Player not found in room (memory)');
        return res.status(404).json({ error: 'Player not found in room' });
      }

      // Get all players in room
      const roomPlayers = room.players.map(pid => memoryPlayers.get(pid)).filter(Boolean);
      
      console.log(`📊 Memory room status: ${room.roomId}, players: ${room.currentPlayerCount}, state: ${room.gameState}`);
      
      return res.json({
        success: true,
        room: {
          roomId: room.roomId,
          gameState: room.gameState,
          currentPlayerCount: room.currentPlayerCount,
          maxPlayers: 2,
          players: roomPlayers.map(p => ({
            playerId: p!.playerId,
            name: p!.name,
            position: p!.position,
            isReady: false, // Default for memory mode
            isHost: p!.isHost
          }))
        },
        yourPlayer: {
          playerId: player.playerId,
          name: player.name,
          position: player.position,
          isReady: false, // Default for memory mode
          isHost: player.isHost
        },
        fallbackMode: true
      });
    } else {
      // Use database storage (original logic)
      const room = await Room.findOne({ roomId, isActive: true })
        .populate('players');
      
      if (!room) {
        console.log('❌ Room not found in database');
        return res.status(404).json({ error: 'Room not found' });
      }

      const player = await OnlinePlayer.findOne({ playerId, roomId });
      if (!player) {
        console.log('❌ Player not found in room (database)');
        return res.status(404).json({ error: 'Player not found in room' });
      }

      // อัพเดท heartbeat
      player.lastHeartbeat = new Date();
      await player.save();

      const players = await OnlinePlayer.find({ roomId }).sort({ position: 1 });
      
      console.log(`📊 Database room status: ${room.roomId}, players: ${room.currentPlayerCount}, state: ${room.gameState}`);
      
      return res.json({
        success: true,
        room: {
          roomId: room.roomId,
          gameState: room.gameState,
          currentPlayerCount: room.currentPlayerCount,
          maxPlayers: room.maxPlayers,
          players: players.map(p => ({
            playerId: p.playerId,
            name: p.name,
            position: p.position,
            isReady: p.isReady,
            isHost: p.isHost
          }))
        },
        yourPlayer: {
          playerId: player.playerId,
          name: player.name,
          position: player.position,
          isReady: player.isReady,
          isHost: player.isHost
        }
      });
    }
  } catch (error) {
    console.error('💥 Error getting room status:', error);
    
    const errorResponse = {
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && {
        details: String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
    };
    
    res.status(500).json(errorResponse);
  }
}