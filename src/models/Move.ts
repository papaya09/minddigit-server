import mongoose, { Schema, Document } from 'mongoose';

export interface IMove extends Document {
  gameId: mongoose.Types.ObjectId;
  from: mongoose.Types.ObjectId; // player who made the guess
  to: mongoose.Types.ObjectId;   // target player
  guess: string;                 // 4-digit guess
  hit: number;                   // number of correct digits
  round: number;
  createdAt: Date;
}

const MoveSchema: Schema = new Schema({
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  from: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
  to: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
  guess: { type: String, required: true, length: 4 },
  hit: { type: Number, required: true, min: 0, max: 4 },
  round: { type: Number, required: true, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

MoveSchema.index({ gameId: 1, round: 1 });

export default mongoose.model<IMove>('Move', MoveSchema);