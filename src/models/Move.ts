import mongoose, { Schema, Document } from 'mongoose';

export interface IMove extends Document {
  gameId: mongoose.Types.ObjectId;
  roomCode: string;
  fromPlayer: string;
  targetPlayer: string;
  from: mongoose.Types.ObjectId; // player who made the guess
  to: mongoose.Types.ObjectId;   // target player
  guess: string;                 // 4-digit guess
  hits: number;                  // number of correct digits (renamed from hit)
  round: number;
  moveNumber: number;
  gamePhase: string;
  isWinning: boolean;
  timestamp: Date;
  createdAt: Date;
}

const MoveSchema: Schema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  roomCode: { type: String, required: true, index: true },
  fromPlayer: { type: String, required: true },
  targetPlayer: { type: String, required: true },
  from: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
  guess: { type: String, required: true, length: 4 },
  hits: { type: Number, required: true, min: 0, max: 4 },
  round: { type: Number, required: true, default: 1 },
  moveNumber: { type: Number, required: true },
  gamePhase: { type: String, default: 'active' },
  isWinning: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for performance
MoveSchema.index({ gameId: 1, round: 1 });
MoveSchema.index({ roomCode: 1, timestamp: 1 });
MoveSchema.index({ roomCode: 1, moveNumber: 1 });
MoveSchema.index({ fromPlayer: 1 });
MoveSchema.index({ isWinning: 1 });

export default mongoose.model<IMove>('Move', MoveSchema);