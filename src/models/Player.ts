import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer extends Document {
  name: string;
  avatar: string;
  secret?: string;
  gameId: mongoose.Types.ObjectId;
  roomCode: string;
  socketId?: string;
  isReady: boolean;
  isConnected: boolean;
  lastHeartbeat: Date;
  joinedAt: Date;
  position: number;
  stats: {
    guessesMade: number;
    correctGuesses: number;
    gamesWon: number;
  };
  createdAt: Date;
}

const PlayerSchema: Schema = new Schema({
  name: { type: String, required: true, maxlength: 20 },
  avatar: { type: String, default: '🎯' },
  secret: { type: String }, // 4-digit secret number
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  roomCode: { type: String, required: true, index: true },
  socketId: { type: String },
  isReady: { type: Boolean, default: false },
  isConnected: { type: Boolean, default: true },
  lastHeartbeat: { type: Date, default: Date.now, index: true },
  joinedAt: { type: Date, default: Date.now },
  position: { type: Number, min: 1, max: 4 },
  stats: {
    guessesMade: { type: Number, default: 0 },
    correctGuesses: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
PlayerSchema.index({ gameId: 1 });
PlayerSchema.index({ roomCode: 1, name: 1 }, { unique: true });
PlayerSchema.index({ isConnected: 1 });

// TTL index for heartbeat cleanup (5 minutes)
PlayerSchema.index({ lastHeartbeat: 1 }, { expireAfterSeconds: 300 });

export default mongoose.model<IPlayer>('Player', PlayerSchema);