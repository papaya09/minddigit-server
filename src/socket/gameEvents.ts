import { Server, Socket } from 'socket.io';
import Game from '../models/Game';
import Player from '../models/Player';
import Move from '../models/Move';
import { calculateHit, isValidSecret } from '../utils/gameUtils';

export const setupGameEvents = (io: Server, socket: Socket) => {
  console.log('🔗 New client connected:', socket.id);
  
  // Join game room
  socket.on('joinRoom', async (data: { code: string, playerName: string, avatar?: string }) => {
    try {
      console.log('🏠 Join room request:', data);
      const { code, playerName, avatar = '🎯' } = data;
      
      // Validate input
      if (!code || !playerName) {
        socket.emit('error', { message: 'Missing room code or player name' });
        return;
      }
      
      const game = await Game.findOne({ code });
      if (!game) {
        console.log('❌ Room not found:', code);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      // Check if room is full (max 4 players)
      const playerCount = await Player.countDocuments({ gameId: game._id });
      if (playerCount >= 4) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      
      // Create or update player
      let player = await Player.findOne({ gameId: game._id, name: playerName });
      if (!player) {
        player = new Player({ 
          name: playerName, 
          avatar, 
          gameId: game._id,
          socketId: socket.id 
        });
        await player.save();
      } else {
        player.socketId = socket.id;
        await player.save();
      }
      
      socket.join(code);
      console.log(`✅ Player ${playerName} joined room ${code}`);
      
      // Send room state to all players
      const players = await Player.find({ gameId: game._id }).select('-secret');
      io.to(code).emit('roomState', { 
        game: { code, state: game.state, digits: game.digits },
        players 
      });
      
    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });
  
  // Set player's secret number
  socket.on('setSecret', async (data: { code: string, secret: string }) => {
    try {
      const { code, secret } = data;
      
      if (!isValidSecret(secret)) {
        socket.emit('error', { message: 'Invalid secret number' });
        return;
      }
      
      const game = await Game.findOne({ code });
      if (!game) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      const player = await Player.findOne({ gameId: game._id, socketId: socket.id });
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      player.secret = secret;
      player.isReady = true;
      await player.save();
      
      // Check if all players are ready
      const allPlayers = await Player.find({ gameId: game._id });
      const readyPlayers = allPlayers.filter(p => p.isReady);
      
      if (readyPlayers.length >= 2 && readyPlayers.length === allPlayers.length) {
        game.state = 'active';
        game.startedAt = new Date();
        await game.save();
        
        io.to(code).emit('gameStart', { message: 'Game started!' });
      }
      
      // Update room state
      const players = await Player.find({ gameId: game._id }).select('-secret');
      io.to(code).emit('roomState', { 
        game: { code, state: game.state, digits: game.digits },
        players 
      });
      
    } catch (error) {
      socket.emit('error', { message: 'Failed to set secret' });
    }
  });
  
  // Make a guess
  socket.on('makeGuess', async (data: { code: string, targetPlayer: string, guess: string }) => {
    try {
      const { code, targetPlayer, guess } = data;
      
      if (!isValidSecret(guess)) {
        socket.emit('error', { message: 'Invalid guess' });
        return;
      }
      
      const game = await Game.findOne({ code });
      if (!game || game.state !== 'active') {
        socket.emit('error', { message: 'Game not active' });
        return;
      }
      
      const fromPlayer = await Player.findOne({ gameId: game._id, socketId: socket.id });
      const toPlayer = await Player.findOne({ gameId: game._id, name: targetPlayer });
      
      if (!fromPlayer || !toPlayer || !toPlayer.secret) {
        socket.emit('error', { message: 'Invalid players' });
        return;
      }
      
      // Calculate hit
      const hit = calculateHit(toPlayer.secret, guess);
      
      // Save move
      const move = new Move({
        gameId: game._id,
        from: fromPlayer._id,
        to: toPlayer._id,
        guess,
        hit,
        round: 1 // TODO: implement proper rounds
      });
      await move.save();
      
      // Check if game is won
      if (hit === 4) {
        game.state = 'finished';
        game.winner = fromPlayer._id;
        await game.save();
        
        io.to(code).emit('gameEnd', { 
          winner: fromPlayer.name,
          secret: toPlayer.secret
        });
      } else {
        // Send move result
        io.to(code).emit('moveResult', {
          from: fromPlayer.name,
          to: toPlayer.name,
          guess,
          hit
        });
      }
      
    } catch (error) {
      socket.emit('error', { message: 'Failed to make guess' });
    }
  });
  
  // Get available rooms list
  socket.on('getRoomList', async () => {
    try {
      const games = await Game.find({ state: { $in: ['waiting', 'active'] } })
        .sort({ createdAt: -1 })
        .limit(20);
      
      const roomList = await Promise.all(games.map(async (game) => {
        const players = await Player.find({ gameId: game._id }).select('name avatar');
        const hostPlayer = players[0];
        
        return {
          code: game.code,
          hostName: hostPlayer?.name || 'Unknown',
          hostAvatar: hostPlayer?.avatar || '🎯',
          gameMode: `${game.digits}D`,
          playerCount: players.length,
          maxPlayers: 4,
          isGameStarted: game.state === 'active'
        };
      }));
      
      socket.emit('roomList', roomList);
    } catch (error) {
      socket.emit('error', { message: 'Failed to get room list' });
    }
  });

  socket.on('disconnect', async () => {
    console.log('⚠️ Player disconnected:', socket.id);
    
    try {
      // Find and update player status
      const player = await Player.findOne({ socketId: socket.id });
      if (player) {
        // Remove socket ID but keep player for potential reconnection
        player.socketId = undefined;
        await player.save();
        
        // Notify other players in the room
        const game = await Game.findById(player.gameId);
        if (game) {
          const players = await Player.find({ gameId: game._id }).select('-secret');
          socket.to(game.code).emit('roomState', {
            game: { code: game.code, state: game.state, digits: game.digits },
            players
          });
        }
      }
    } catch (error) {
      console.error('❌ Error handling disconnect:', error);
    }
  });
  
  // Handle ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });
};