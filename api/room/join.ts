import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';
import { v4 as uuidv4 } from 'uuid';

// In-memory fallback storage
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
  players: string[]; // player IDs
  currentPlayerCount: number;
  gameState: 'WAITING' | 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  hostPlayerId: string;
  createdAt: Date;
  isActive: boolean;
}

// Global in-memory storage (reset on each deployment)
let memoryRooms: Map<string, InMemoryRoom> = new Map();
let memoryPlayers: Map<string, InMemoryPlayer> = new Map();
let useMemoryFallback = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 Starting room join process...');
    
    // Try connecting to database
    let databaseConnected = false;
    try {
      await connectToDatabase();
      console.log('✅ Database connected successfully');
      databaseConnected = true;
      useMemoryFallback = false;
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError);
      console.log('🔄 Falling back to in-memory storage for this session');
      databaseConnected = false;
      useMemoryFallback = true;
    }
    
    const { playerName } = req.body;
    console.log('📝 Player name received:', playerName);
    
    if (!playerName || playerName.trim().length === 0) {
      console.log('❌ Invalid player name');
      return res.status(400).json({ error: 'Player name is required' });
    }

    let playerId = uuidv4();
    let position = 1;

    if (useMemoryFallback) {
      // Use in-memory storage
      console.log('🧠 Using in-memory storage');
      
      // Find waiting room
      let waitingRoom: InMemoryRoom | undefined;
      for (const room of memoryRooms.values()) {
        if (room.gameState === 'WAITING' && room.currentPlayerCount < 2 && room.isActive) {
          waitingRoom = room;
          break;
        }
      }

      if (waitingRoom) {
        // Join existing room
        position = waitingRoom.currentPlayerCount + 1;
        
        const player: InMemoryPlayer = {
          playerId,
          name: playerName.trim(),
          roomId: waitingRoom.roomId,
          position,
          isHost: false,
          createdAt: new Date()
        };
        
        memoryPlayers.set(playerId, player);
        waitingRoom.players.push(playerId);
        waitingRoom.currentPlayerCount++;
        waitingRoom.gameState = waitingRoom.currentPlayerCount >= 2 ? 'DIGIT_SELECTION' : 'WAITING';
        
        console.log(`✅ Player ${playerName} joined memory room ${waitingRoom.roomId} as position ${position}`);
        console.log(`📊 Room now has ${waitingRoom.currentPlayerCount} players, state: ${waitingRoom.gameState}`);
        
        return res.json({
          success: true,
          roomId: waitingRoom.roomId,
          playerId,
          position,
          gameState: waitingRoom.gameState,
          message: 'Joined existing room (memory mode)',
          fallbackMode: true
        });
      } else {
        // Create new room in memory
        const roomId = uuidv4().substring(0, 8).toUpperCase();
        console.log('🏗️ Creating new memory room:', roomId);
        
        const player: InMemoryPlayer = {
          playerId,
          name: playerName.trim(),
          roomId,
          position,
          isHost: true,
          createdAt: new Date()
        };
        
        const room: InMemoryRoom = {
          roomId,
          players: [playerId],
          currentPlayerCount: 1,
          gameState: 'WAITING',
          hostPlayerId: playerId,
          createdAt: new Date(),
          isActive: true
        };
        
        memoryPlayers.set(playerId, player);
        memoryRooms.set(roomId, room);
        
        console.log(`🎉 Created new memory room ${roomId} for player ${playerName}`);
        
        return res.json({
          success: true,
          roomId,
          playerId,
          position,
          gameState: 'WAITING',
          message: 'Created new room (memory mode)',
          fallbackMode: true
        });
      }
    } else {
      // Use database storage (original logic)
      let room;
      try {
        room = await Room.findOne({
          gameState: 'WAITING',
          currentPlayerCount: { $lt: 2 },
          isActive: true
        }).sort({ createdAt: 1 });
        
        console.log('🔍 Found room:', room ? `${room.roomId} (${room.currentPlayerCount}/2)` : 'none');
      } catch (findError) {
        console.error('❌ Error finding room:', findError);
        room = null;
      }

      if (room) {
        // Join existing room
        try {
          position = room.currentPlayerCount + 1;
          
          const player = new OnlinePlayer({
            playerId,
            name: playerName.trim(),
            roomId: room.roomId,
            position,
            isHost: false
          });
          
          await player.save();
          console.log('✅ Player saved successfully');
          
          room.players.push(player._id);
          room.currentPlayerCount = room.currentPlayerCount + 1;
          room.gameState = room.currentPlayerCount >= 2 ? 'DIGIT_SELECTION' : 'WAITING';
          room.lastActivity = new Date();
          await room.save();
          
          console.log(`✅ Player ${playerName} joined room ${room.roomId} as position ${position}`);
          console.log(`📊 Room now has ${room.currentPlayerCount} players, state: ${room.gameState}`);
          
          return res.json({
            success: true,
            roomId: room.roomId,
            playerId,
            position,
            gameState: room.gameState,
            message: 'Joined existing room'
          });
        } catch (joinError) {
          console.error('❌ Error joining existing room:', joinError);
          throw joinError;
        }
      } else {
        // Create new room
        try {
          const roomId = uuidv4().substring(0, 8).toUpperCase();
          console.log('🏗️ Creating new room:', roomId);
          
          const player = new OnlinePlayer({
            playerId,
            name: playerName.trim(),
            roomId,
            position,
            isHost: true
          });
          
          await player.save();
          console.log('✅ New player saved successfully');
          
          room = new Room({
            roomId,
            players: [player._id],
            currentPlayerCount: 1,
            hostPlayerId: player._id,
            gameState: 'WAITING'
          });
          
          await room.save();
          console.log('✅ New room created successfully');
          
          console.log(`🎉 Created new room ${roomId} for player ${playerName}`);
          
          return res.json({
            success: true,
            roomId,
            playerId,
            position,
            gameState: 'WAITING',
            message: 'Created new room'
          });
        } catch (createError) {
          console.error('❌ Error creating new room:', createError);
          throw createError;
        }
      }
    }
  } catch (error) {
    console.error('💥 Unexpected error in room join:', error);
    
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