import mongoose from 'mongoose';

// Global variable to cache the connection
let cachedConnection: typeof mongoose | null = null;

const connectDB = async (): Promise<typeof mongoose> => {
  // Return cached connection if available
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.warn('⚠️ MONGODB_URI environment variable is not set');
      console.warn('🔧 Please set up MongoDB Atlas and add MONGODB_URI to Vercel environment variables');
      console.warn('📖 Guide: https://www.mongodb.com/atlas');
      throw new Error('MongoDB URI not configured');
    }
    
    // Optimized connection options for Vercel serverless
    const options = {
      maxPoolSize: 5,              // Reduced for serverless
      minPoolSize: 1,              // Maintain minimum connections
      maxIdleTimeMS: 30000,        // Close connections after 30s idle
      serverSelectionTimeoutMS: 10000,  // Increased timeout
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      bufferCommands: false,       // Disable mongoose buffering
      // Serverless optimizations
      heartbeatFrequencyMS: 10000, // Check connection every 10s
      retryWrites: true,
      retryReads: true
    };
    
    const connection = await mongoose.connect(mongoURI, options);
    cachedConnection = connection;
    
    console.log('📦 MongoDB Connected successfully');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    
    // Handle connection events (only setup once)
    if (!mongoose.connection.listeners('error').length) {
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
        cachedConnection = null; // Clear cache on error
      });
      
      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        cachedConnection = null; // Clear cache on disconnect
      });
      
      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
      });
    }
    
    return connection;
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    cachedConnection = null; // Clear cache on failure
    
    // In serverless, throw error instead of process.exit
    if (process.env.VERCEL) {
      throw error;
    }
    
    // In development, exit process
    process.exit(1);
  }
};

// Utility function to ensure connection
export const ensureConnection = async (): Promise<typeof mongoose> => {
  if (!cachedConnection || mongoose.connection.readyState !== 1) {
    return await connectDB();
  }
  return cachedConnection;
};

export default connectDB;