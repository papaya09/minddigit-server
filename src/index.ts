import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
// import connectDB from './config/database'; // Disabled for in-memory storage
import { setupGameEvents } from './socket/gameEvents';

const PORT = process.env.PORT || 3000;

// Connect to MongoDB - DISABLED for in-memory storage
// connectDB();

console.log('🎮 MindDigits Server starting with in-memory storage...');
console.log(`🌐 Region: ${process.env.VERCEL_REGION || 'local'}`);
console.log(`⏰ Instance started at: ${new Date().toISOString()}`);

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toLocaleTimeString()}`);
  next();
});

// Export app for Vercel
export default app;

// Create HTTP server for local development
const server = createServer(app);

// Setup Socket.IO with improved CORS for Vercel
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);
  
  setupGameEvents(io, socket);
});

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 MindDigits Server running on port ${PORT}`);
  });
}