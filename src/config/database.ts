import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.warn('⚠️ MONGODB_URI environment variable is not set');
      console.warn('🔧 Please set up MongoDB Atlas and add MONGODB_URI to Vercel environment variables');
      console.warn('📖 Guide: https://www.mongodb.com/atlas');
      return; // Skip connection in production if no URI
    }
    
    // MongoDB connection options for better reliability
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0
    };
    
    await mongoose.connect(mongoURI, options);
    
    console.log('📦 MongoDB Connected successfully');
    console.log(`📍 Database: ${mongoose.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    
    // In production, don't exit process for Vercel
    if (process.env.NODE_ENV === 'production') {
      console.error('🔄 Retrying connection in 5 seconds...');
      setTimeout(connectDB, 5000);
    } else {
      process.exit(1);
    }
  }
};

export default connectDB;