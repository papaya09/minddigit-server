import cron from 'node-cron';
import Game from '../models/Game';
import Player from '../models/Player';
import Connection from '../models/Connection';

// Cleanup inactive games every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const oneHour = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Mark games as inactive if no activity for 1 hour
    const inactiveGames = await Game.updateMany(
      {
        lastActivity: { $lt: oneHour },
        state: { $in: ['waiting', 'active'] },
        isActive: true
      },
      {
        $set: { isActive: false, state: 'finished' }
      }
    );
    
    if (inactiveGames.modifiedCount > 0) {
      console.log(`🧹 Cleaned up ${inactiveGames.modifiedCount} inactive games`);
    }
    
    // Mark players as disconnected if no heartbeat for 5 minutes
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const disconnectedPlayers = await Player.updateMany(
      {
        lastHeartbeat: { $lt: fiveMinutesAgo },
        isConnected: true
      },
      {
        $set: { isConnected: false }
      }
    );
    
    if (disconnectedPlayers.modifiedCount > 0) {
      console.log(`🧹 Marked ${disconnectedPlayers.modifiedCount} players as disconnected`);
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
});

// Update game activity when players join/leave or make moves
export const updateGameActivity = async (roomCode: string): Promise<void> => {
  try {
    await Game.findOneAndUpdate(
      { code: roomCode },
      { $set: { lastActivity: new Date() } }
    );
  } catch (error) {
    console.error('❌ Error updating game activity:', error);
  }
};

console.log('🧹 Cleanup jobs scheduled');