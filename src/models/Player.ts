import mongoose, { Schema, Document } from 'mongoose';

export interface IPlayer extends Document {
  name: string;
  avatar: string;
  secret?: string;
  gameId: mongoose.Types.ObjectId;
  socketId?: string;
  isReady: boolean;
  createdAt: Date;
}

const PlayerSchema: Schema = new Schema({
  name: { type: String, required: true, maxlength: 20 },
  avatar: { type: String, default: '🎯' },
  secret: { type: String }, // 4-digit secret number
  gameId: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
  socketId: { type: String },
  isReady: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

PlayerSchema.index({ gameId: 1 });

export default mongoose.model<IPlayer>('Player', PlayerSchema);