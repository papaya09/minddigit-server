import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';
import OnlineGame from '../../src/models/OnlineGame';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const { roomId, playerId } = req.body;
    
    if (!roomId || !playerId) {
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // ทำให้ผู้เล่นไม่ active
    player.isConnected = false;
    await player.save();

    const room = await Room.findOne({ roomId });
    if (room) {
      // ถ้าเหลือผู้เล่นคนเดียว ให้จบเกม
      const activePlayers = await OnlinePlayer.find({ 
        roomId, 
        isConnected: true 
      });
      
      if (activePlayers.length <= 1) {
        room.gameState = 'FINISHED';
        room.isActive = false;
        await room.save();
        
        // จบเกมถ้ามี
        const game = await OnlineGame.findOne({ roomId });
        if (game && game.gameState !== 'FINISHED') {
          game.gameState = 'FINISHED';
          game.finishedAt = new Date();
          // ให้คนที่เหลืออยู่ชนะ
          if (activePlayers.length === 1) {
            game.winner = activePlayers[0]._id;
          }
          await game.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Left the game successfully'
    });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}