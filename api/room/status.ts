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
}