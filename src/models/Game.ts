import mongoose, { Schema, Document } from 'mongoose';

export interface IGame extends Document {
  code: string;
  digits: number;
  state: 'waiting' | 'active' | 'finished';
  winner?: mongoose.Types.ObjectId;
  startedAt?: Date;
  createdAt: Date;
}

const GameSchema: Schema = new Schema({
  code: { type: String, required: true, unique: true, index: true },
  digits: { type: Number, required: true, default: 4 },
  state: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting' },
  winner: { type: Schema.Types.ObjectId, ref: 'Player' },
  startedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IGame>('Game', GameSchema);