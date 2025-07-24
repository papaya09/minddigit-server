import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  code: string;
  digits: number;
  state: 'waiting' | 'active' | 'finished';
  gameMode: string;
  hostPlayer: string;
  maxPlayers: number;
  currentPlayers: number;
  winner?: mongoose.Types.ObjectId;
  startedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  gameSettings: {
    digits: number;
    timeLimit?: number;
    allowDuplicates: boolean;
  };
  isActive: boolean;
  // Turn-based gameplay fields
  currentTurn?: string;        // current player's name
  turnOrder: string[];         // array of player names in turn order
  turnStartTime?: Date;        // when current turn started
  turnTimeLimit: number;       // seconds per turn
  currentRound: number;        // current round number
  maxRounds?: number;          // optional round limit
}

const GameSchema: Schema = new Schema({
  code: { type: String, required: true, unique: true, index: true },
  digits: { type: Number, required: true, default: 4 },
  state: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting', index: true },
  gameMode: { type: String, required: true, default: '4d' },
  hostPlayer: { type: String, required: true },
  maxPlayers: { type: Number, default: 4 },
  currentPlayers: { type: Number, default: 0 },
  winner: { type: Schema.Types.ObjectId, ref: 'Player' },
  startedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now, index: true },
  gameSettings: {
    digits: { type: Number, default: 4 },
    timeLimit: { type: Number },
    allowDuplicates: { type: Boolean, default: false }
  },
  isActive: { type: Boolean, default: true, index: true },
  // Turn-based gameplay fields
  currentTurn: { type: String, index: true },
  turnOrder: [{ type: String }],
  turnStartTime: { type: Date },
  turnTimeLimit: { type: Number, default: 30 }, // 30 seconds per turn
  currentRound: { type: Number, default: 1 },
  maxRounds: { type: Number }
}, {
  timestamps: true
});

// Additional indexes for performance
GameSchema.index({ state: 1, isActive: 1 });
GameSchema.index({ hostPlayer: 1 });
GameSchema.index({ gameMode: 1 });

// TTL index for automatic cleanup (24 hours)
GameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model<IGame>('Game', GameSchema);