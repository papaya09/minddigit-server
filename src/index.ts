import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';
import connectDB from './config/database';
import { setupGameEvents } from './socket/gameEvents';

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Create HTTP server
const server = createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);
  
  setupGameEvents(io, socket);
});

server.listen(PORT, () => {
  console.log(`🚀 MindDigits Server running on port ${PORT}`);
});