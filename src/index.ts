import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import connectDB from './config/database';
import './utils/cleanup'; // Cleanup jobs

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB().then(() => {
  console.log('🎮 MindDigits Server starting with MongoDB...');
}).catch((error) => {
  console.error('❌ Failed to connect to MongoDB:', error);
});

console.log(`🌐 Region: ${process.env.VERCEL_REGION || 'local'}`);
console.log(`⏰ Instance started at: ${new Date().toISOString()}`);

// Log all incoming requests for debugging in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.path} - ${new Date().toLocaleTimeString()}`);
    next();
  });
}

// Export app for Vercel
export default app;

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  const server = require('http').createServer(app);
  server.listen(PORT, () => {
    console.log(`🚀 MindDigits Server running on port ${PORT}`);
  });
}