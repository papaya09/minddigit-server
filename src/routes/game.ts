import express from 'express';
import Game from '../models/Game';
import Player from '../models/Player';
import { generateRoomCode } from '../utils/gameUtils';

const router = express.Router();

// Create new game room
router.post('/rooms', async (req, res) => {
  try {
    const { digits = 4 } = req.body;
    
    let code = generateRoomCode();
    
    // Ensure unique room code
    while (await Game.findOne({ code })) {
      code = generateRoomCode();
    }
    
    const game = new Game({ code, digits });
    await game.save();
    
    res.json({ 
      success: true, 
      game: { code: game.code, digits: game.digits, state: game.state } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create room' });
  }
});

// Get room info
router.get('/rooms/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const game = await Game.findOne({ code });
    if (!game) {
      return res.status(404).json({ success: false, error: 'Room not found' });
    }
    
    const players = await Player.find({ gameId: game._id }).select('-secret');
    
    res.json({ 
      success: true, 
      game: {
        code: game.code,
        digits: game.digits,
        state: game.state,
        playerCount: players.length
      },
      players 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get room' });
  }
});

export default router;