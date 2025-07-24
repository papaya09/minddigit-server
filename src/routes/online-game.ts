import express from 'express';
import Room from '../models/Room';
import OnlinePlayer from '../models/OnlinePlayer';
import OnlineGame from '../models/OnlineGame';
import { calculateBullsAndCows } from '../utils/gameUtils';

const router = express.Router();

// POST /api/game/guess - ทายเลข
router.post('/guess', async (req, res) => {
  try {
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
});

// POST /api/game/leave - ออกจากเกม
router.post('/leave', async (req, res) => {
  try {
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
});

// GET /api/game/history - ดูประวัติการทาย
router.get('/history', async (req, res) => {
  try {
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    const game = await OnlineGame.findOne({ roomId });
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const players = await OnlinePlayer.find({ roomId });
    const playerMap = new Map(players.map(p => [p._id.toString(), p.name]));

    res.json({
      success: true,
      history: game.moves.map(move => ({
        playerName: playerMap.get(move.playerId.toString()),
        playerId: move.playerId.toString(),
        guess: move.guess,
        bulls: move.bulls,
        cows: move.cows,
        timestamp: move.timestamp,
        isYour: move.playerId.toString() === player._id.toString()
      })),
      gameState: game.gameState,
      winner: game.winner ? {
        playerId: game.winner.toString(),
        playerName: playerMap.get(game.winner.toString())
      } : null
    });
  } catch (error) {
    console.error('Error getting game history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;