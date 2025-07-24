import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const { playerName } = req.body;
    
    if (!playerName || playerName.trim().length === 0) {
      return res.status(400).json({ error: 'Player name is required' });
    }

    // หาห้องที่รอผู้เล่น (มีคนเดียว)
    let room = await Room.findOne({
      gameState: 'WAITING',
      currentPlayerCount: 1,
      isActive: true
    });

    let playerId = uuidv4();
    let position = 1;

    if (room) {
      // เข้าห้องที่มีอยู่
      position = 2;
      
      // สร้างผู้เล่นคนที่ 2
      const player = new OnlinePlayer({
        playerId,
        name: playerName.trim(),
        roomId: room.roomId,
        position,
        isHost: false
      });
      
      await player.save();
      
      // อัพเดทห้อง
      room.players.push(player._id);
      room.currentPlayerCount = 2;
      room.gameState = 'DIGIT_SELECTION';
      room.lastActivity = new Date();
      await room.save();
      
      res.json({
        success: true,
        roomId: room.roomId,
        playerId,
        position,
        gameState: 'DIGIT_SELECTION',
        message: 'Joined existing room'
      });
    } else {
      // สร้างห้องใหม่
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      
      const player = new OnlinePlayer({
        playerId,
        name: playerName.trim(),
        roomId,
        position,
        isHost: true
      });
      
      await player.save();
      
      room = new Room({
        roomId,
        players: [player._id],
        currentPlayerCount: 1,
        hostPlayerId: player._id,
        gameState: 'WAITING'
      });
      
      await room.save();
      
      res.json({
        success: true,
        roomId,
        playerId,
        position,
        gameState: 'WAITING',
        message: 'Created new room'
      });
    }
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}