import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';
import OnlineGame from '../../src/models/OnlineGame';
import { calculateBullsAndCows } from '../../src/utils/gameUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const { roomId, playerId, guess } = req.body;
    
    if (!roomId || !playerId || !guess) {
      return res.status(400).json({ error: 'Room ID, Player ID, and guess are required' });
    }

    const room = await Room.findOne({ roomId, isActive: true });
    if (!room || room.gameState !== 'PLAYING') {
      return res.status(400).json({ error: 'Game is not in playing state' });
    }

    const game = await OnlineGame.findOne({ roomId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // ตรวจสอบว่าเป็นเทิร์นของผู้เล่นนี้หรือไม่
    if (game.currentTurnPlayerId?.toString() !== player._id.toString()) {
      return res.status(400).json({ error: 'Not your turn' });
    }

    // ตรวจสอบความถูกต้องของการทาย
    if (guess.length !== game.digits) {
      return res.status(400).json({ error: `Guess must be ${game.digits} digits` });
    }

    if (!/^\d+$/.test(guess)) {
      return res.status(400).json({ error: 'Guess must contain only numbers' });
    }

    // หาเลขลับของฝั่งตรงข้าม
    const otherPlayer = await OnlinePlayer.findOne({
      roomId,
      _id: { $ne: player._id }
    });
    
    if (!otherPlayer?.secret) {
      return res.status(400).json({ error: 'Other player secret not found' });
    }

    // คำนวณ Bulls และ Cows
    const { bulls, cows } = calculateBullsAndCows(guess, otherPlayer.secret);
    
    // บันทึกการทาย
    const move = {
      playerId: player._id,
      guess,
      bulls,
      cows,
      timestamp: new Date()
    };
    
    game.moves.push(move);
    
    // เช็คการชนะ
    let isWin = bulls === game.digits;
    let gameFinished = false;
    
    if (isWin) {
      game.winner = player._id;
      game.gameState = 'FINISHED';
      game.finishedAt = new Date();
      room.gameState = 'FINISHED';
      room.winner = player._id;
      gameFinished = true;
    } else {
      // สลับเทิร์น
      const nextPlayer = await OnlinePlayer.findOne({
        roomId,
        _id: { $ne: player._id }
      });
      game.currentTurnPlayerId = nextPlayer?._id;
      room.currentTurn = nextPlayer?._id;
    }
    
    await game.save();
    await room.save();
    
    // บันทึกการทายในประวัติของผู้เล่น
    player.guesses.push({
      guess,
      bulls,
      cows,
      timestamp: new Date()
    });
    await player.save();

    res.json({
      success: true,
      result: {
        guess,
        bulls,
        cows,
        isWin,
        gameFinished
      },
      gameState: game.gameState,
      currentTurn: game.currentTurnPlayerId?.toString(),
      winner: game.winner?.toString(),
      message: isWin ? 'You won!' : `${bulls} Bulls, ${cows} Cows`
    });
  } catch (error) {
    console.error('Error processing guess:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}