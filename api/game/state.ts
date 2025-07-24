import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';
import OnlineGame from '../../src/models/OnlineGame';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
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
}