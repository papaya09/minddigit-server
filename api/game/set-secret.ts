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
    
    const { roomId, playerId, secret } = req.body;
    
    if (!roomId || !playerId || !secret) {
      return res.status(400).json({ error: 'Room ID, Player ID, and secret are required' });
    }

    const room = await Room.findOne({ roomId, isActive: true });
    if (!room || room.gameState !== 'SECRET_SETTING') {
      return res.status(400).json({ error: 'Invalid room state for setting secret' });
    }

    // ตรวจสอบความถูกต้องของเลขลับ
    if (secret.length !== room.gameSettings.digits) {
      return res.status(400).json({ error: `Secret must be ${room.gameSettings.digits} digits` });
    }

    if (!/^\d+$/.test(secret)) {
      return res.status(400).json({ error: 'Secret must contain only numbers' });
    }

    if (!room.gameSettings.allowDuplicates && new Set(secret).size !== secret.length) {
      return res.status(400).json({ error: 'Secret cannot have duplicate digits' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // บันทึกเลขลับ
    player.secret = secret;
    player.isReady = true;
    await player.save();

    // เช็คว่าทั้งคู่ตั้งเลขลับแล้วหรือยัง
    const players = await OnlinePlayer.find({ roomId });
    const allReady = players.every(p => p.isReady && p.secret);

    if (allReady && players.length === 2) {
      // สร้างเกม
      const game = new OnlineGame({
        roomId,
        player1Id: players.find(p => p.position === 1)?._id,
        player2Id: players.find(p => p.position === 2)?._id,
        digits: room.gameSettings.digits,
        gameState: 'PLAYING',
        currentTurnPlayerId: players.find(p => p.position === 1)?._id, // เริ่มจากคนแรก
        startedAt: new Date()
      });
      
      await game.save();
      
      room.gameState = 'PLAYING';
      room.currentTurn = players.find(p => p.position === 1)?._id;
      room.lastActivity = new Date();
      await room.save();
    }

    res.json({
      success: true,
      gameState: room.gameState,
      yourSecret: secret,
      message: allReady ? 'Game started!' : 'Waiting for other player to set secret'
    });
  } catch (error) {
    console.error('Error setting secret:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}