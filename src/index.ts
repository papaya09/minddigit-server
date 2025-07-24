import express from 'express';
import cors from 'cors';
import connectDB from './config/database';

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://192.168.1.140:3000', 
    'http://192.168.1.140:8080',
    'https://minddigit-server.vercel.app',
    // Allow iOS app requests
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    region: process.env.VERCEL_REGION || 'local'
  });
});

// Simple join endpoint (without database)
app.post('/api/room/join-local', async (req, res) => {
  try {
    console.log('🚀 Local join process started');
    
    const { playerName } = req.body;
    console.log('📝 Player name:', playerName);
    
    if (!playerName || playerName.trim().length === 0) {
      console.log('❌ Invalid player name');
      return res.status(400).json({ error: 'Player name is required' });
    }

    // Generate simple IDs
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerId = Math.random().toString(36).substring(2, 10);
    
    console.log(`🎉 Created local room ${roomId} for player ${playerName}`);
    
    return res.json({
      success: true,
      roomId,
      playerId,
      position: 1,
      gameState: 'WAITING',
      message: 'Local development mode',
      fallbackMode: true,
      mode: 'local-dev'
    });
  } catch (error) {
    console.error('💥 Error in local join:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error)
    });
  }
});

// Simple status endpoint
app.get('/api/room/status-local', async (req, res) => {
  try {
    console.log('🔍 Local status check');
    
    const { roomId, playerId } = req.query;
    
    if (!roomId || !playerId) {
      console.log('❌ Missing roomId or playerId');
      return res.status(400).json({ error: 'Room ID and Player ID are required' });
    }

    console.log(`📊 Local room status: ${roomId}, player: ${playerId}`);
    
    return res.json({
      success: true,
      room: {
        roomId: roomId as string,
        gameState: 'WAITING',
        currentPlayerCount: 1,
        maxPlayers: 2,
        players: [{
          playerId: playerId as string,
          name: 'Local Player',
          position: 1,
          isReady: false,
          isHost: true
        }]
      },
      yourPlayer: {
        playerId: playerId as string,
        name: 'Local Player',
        position: 1,
        isReady: false,
        isHost: true
      },
      fallbackMode: true,
      mode: 'local-dev'
    });
  } catch (error) {
    console.error('💥 Error in local status:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: String(error)
    });
  }
});

// Routes
import onlineRoutes from './routes/online';
app.use('/api', onlineRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const startServer = async () => {
  try {
    // Try to connect to database (but don't fail if it doesn't work)
    try {
      await connectDB();
      console.log('✅ Database connected successfully');
    } catch (dbError) {
      console.warn('⚠️ MongoDB connection failed - running in local mode');
      console.log('🔄 Server will continue without database');
    }
    
    // Server is ready
    console.log('✅ Server initialized successfully');
    
    console.log('🌐 Region:', process.env.VERCEL_REGION || 'local');
    console.log('⏰ Instance started at:', new Date().toISOString());
    
    // Bind to 0.0.0.0 to allow external connections
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MindDigits Server running on port ${PORT}`);
      console.log(`📱 Local access: http://localhost:${PORT}`);
      console.log(`🌐 Network access: http://192.168.1.140:${PORT}`);
      console.log(`🎮 Test endpoint: http://192.168.1.140:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();