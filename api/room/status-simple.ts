import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple in-memory storage (same as join-simple)
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
  players: string[];
  currentPlayerCount: number;
  gameState: 'WAITING' | 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  hostPlayerId: string;
  createdAt: Date;
  isActive: boolean;
}

// Global in-memory storage
declare global {
  var simpleRooms: Map<string, SimpleRoom> | undefined;
  var simplePlayers: Map<string, SimplePlayer> | undefined;
}

// Initialize if not exists
if (!global.simpleRooms) {
  global.simpleRooms = new Map();
  global.simplePlayers = new Map();
}

const rooms = global.simpleRooms!;
const players = global.simplePlayers!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔍 Simple status check');
    
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      console.log('❌ Missing roomId or playerId');
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    const room = rooms.get(roomId as string);
    if (!room || !room.isActive) {
      console.log('❌ Room not found in simple storage');
      return res.status(404).json({ error: 'Room not found' });
    }

    const player = players.get(playerId as string);
    if (!player || player.roomId !== roomId) {
      console.log('❌ Player not found in simple room');
      return res.status(404).json({ error: 'Player not found in room' });
    }

    // Get all players in room
    const roomPlayers = room.players.map(pid => players.get(pid)).filter(Boolean) as SimplePlayer[];
    
    console.log(`📊 Simple room status: ${room.roomId}, players: ${room.currentPlayerCount}, state: ${room.gameState}`);
    
    return res.json({
      success: true,
      room: {
        roomId: room.roomId,
        gameState: room.gameState,
        currentPlayerCount: room.currentPlayerCount,
        maxPlayers: 2,
        players: roomPlayers.map(p => ({
          playerId: p.playerId,
          name: p.name,
          position: p.position,
          isReady: false, // Simple mode default
          isHost: p.isHost
        }))
      },
      yourPlayer: {
        playerId: player.playerId,
        name: player.name,
        position: player.position,
        isReady: false, // Simple mode default
        isHost: player.isHost
      },
      fallbackMode: true,
      mode: 'simple'
    });
  } catch (error) {
    console.error('💥 Error in simple status:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error)
    });
  }
} 