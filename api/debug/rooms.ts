import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../src/config/database';
import Room from '../../src/models/Room';
import OnlinePlayer from '../../src/models/OnlinePlayer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectToDatabase();
    
    const rooms = await Room.find({ isActive: true })
      .populate('players')
      .sort({ createdAt: -1 })
      .limit(10);
    
    const players = await OnlinePlayer.find()
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json({
      success: true,
      rooms: rooms.map(room => ({
        roomId: room.roomId,
        gameState: room.gameState,
        currentPlayerCount: room.currentPlayerCount,
        maxPlayers: room.maxPlayers,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        players: room.players
      })),
      allPlayers: players.map(player => ({
        playerId: player.playerId,
        name: player.name,
        roomId: player.roomId,
        position: player.position,
        isHost: player.isHost,
        isConnected: player.isConnected,
        createdAt: player.createdAt
      }))
    });
  } catch (error) {
    console.error('Error getting debug info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}