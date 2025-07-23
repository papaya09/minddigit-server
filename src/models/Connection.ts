import mongoose, { Schema, Document } from 'mongoose';

export interface IConnection extends Document {
  roomCode: string;
  playerName: string;
  sessionId: string;
  lastSeen: Date;
  isActive: boolean;
  instanceId?: string;
  userAgent?: string;
  createdAt: Date;
}

const ConnectionSchema: Schema = new Schema({
  roomCode: { type: String, required: true, index: true },
  playerName: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true },
  lastSeen: { type: Date, default: Date.now, index: true },
  isActive: { type: Boolean, default: true, index: true },
  instanceId: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Compound index for efficient queries
ConnectionSchema.index({ roomCode: 1, playerName: 1 }, { unique: true });

// TTL index for automatic cleanup (5 minutes)
ConnectionSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 300 });

export default mongoose.model<IConnection>('Connection', ConnectionSchema);