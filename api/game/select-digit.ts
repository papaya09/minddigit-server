import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const { roomId, playerId, digits } = req.body;
    
    if (!roomId || !playerId || !digits) {
      return res.status(400).json({ error: 'Room ID, Player ID, and digits are required' });
    }

    if (digits < 3 || digits > 6) {
      return res.status(400).json({ error: 'Digits must be between 3 and 6' });
    }

    const room = await Room.findOne({ roomId, isActive: true });
    if (!room || room.gameState !== 'DIGIT_SELECTION') {
      return res.status(400).json({ error: 'Invalid room state for digit selection' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // บันทึกการเลือก digits
    player.selectedDigits = digits;
    await player.save();

    // เช็คว่าทั้งคู่เลือกแล้วหรือยัง
    const players = await OnlinePlayer.find({ roomId });
    const allSelected = players.every(p => p.selectedDigits);

    if (allSelected && players.length === 2) {
      // ใช้ digits เดียวกัน (เอาค่าเฉลี่ย หรือค่าของ host)
      const hostPlayer = players.find(p => p.isHost);
      const finalDigits = hostPlayer?.selectedDigits || digits;
      
      room.gameSettings.digits = finalDigits;
      room.gameState = 'SECRET_SETTING';
      room.lastActivity = new Date();
      await room.save();
    }

    res.json({
      success: true,
      selectedDigits: digits,
      gameState: room.gameState,
      message: allSelected ? 'All players selected digits' : 'Waiting for other player'
    });
  } catch (error) {
    console.error('Error selecting digits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}