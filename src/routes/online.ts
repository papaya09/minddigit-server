import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import Room from '../models/Room';
import OnlinePlayer from '../models/OnlinePlayer';
import OnlineGame from '../models/OnlineGame';
import { calculateBullsAndCows } from '../utils/gameUtils';

const router = express.Router();

// POST /api/room/join - เข้าห้อง/สร้างห้องใหม่
router.post('/room/join', async (req, res) => {
  try {
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
});

// GET /api/room/status - ดูสถานะห้องปัจจุบัน
router.get('/room/status', async (req, res) => {
  try {
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    const room = await Room.findOne({ roomId, isActive: true })
      .populate('players');
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found in room' });
    }

    // อัพเดท heartbeat
    player.lastHeartbeat = new Date();
    await player.save();

    const players = await OnlinePlayer.find({ roomId }).sort({ position: 1 });
    
    res.json({
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
  } catch (error) {
    console.error('Error getting room status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/game/state - ดูขั้นตอนการเล่นปัจจุบัน
router.get('/game/state', async (req, res) => {
  try {
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    const room = await Room.findOne({ roomId, isActive: true });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const player = await OnlinePlayer.findOne({ playerId, roomId });
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const game = await OnlineGame.findOne({ roomId });
    const players = await OnlinePlayer.find({ roomId }).sort({ position: 1 });

    res.json({
      success: true,
      gameState: room.gameState,
      room: {
        roomId: room.roomId,
        gameState: room.gameState,
        digits: room.gameSettings.digits
      },
      players: players.map(p => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        isReady: p.isReady,
        secret: p.playerId === playerId ? p.secret : undefined, // แสดงเฉพาะของตัวเอง
        selectedDigits: p.selectedDigits
      })),
      game: game ? {
        currentTurn: game.currentTurnPlayerId?.toString(),
        moves: game.moves.map(move => ({
          playerId: move.playerId.toString(),
          guess: move.guess,
          bulls: move.bulls,
          cows: move.cows,
          timestamp: move.timestamp
        })),
        winner: game.winner?.toString()
      } : null,
      yourPlayer: {
        playerId: player.playerId,
        position: player.position,
        isReady: player.isReady
      }
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/game/select-digit - เลือกจำนวน digit
router.post('/game/select-digit', async (req, res) => {
  try {
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
});

// POST /api/game/set-secret - ตั้งเลขลับ
router.post('/game/set-secret', async (req, res) => {
  try {
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
});

export default router;