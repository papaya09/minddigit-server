import mongoose, { Schema, Document } from 'mongoose';

export interface IRoom extends Document {
  roomId: string;
  players: mongoose.Types.ObjectId[];
  gameState: 'WAITING' | 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  maxPlayers: number;
  currentPlayerCount: number;
  hostPlayerId: mongoose.Types.ObjectId;
  currentTurn?: mongoose.Types.ObjectId;
  gameSettings: {
    digits: number;
    allowDuplicates: boolean;
  };
  winner?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

const RoomSchema: Schema = new Schema({
  roomId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  players: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  }],
  gameState: { 
    type: String, 
    enum: ['WAITING', 'DIGIT_SELECTION', 'SECRET_SETTING', 'PLAYING', 'FINISHED'], 
    default: 'WAITING',
    index: true 
  },
  maxPlayers: { 
    type: Number, 
    default: 2 
  },
  currentPlayerCount: { 
    type: Number, 
    default: 0 
  },
  hostPlayerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  },
  currentTurn: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  },
  gameSettings: {
    digits: { 
      type: Number, 
      default: 4 
    },
    allowDuplicates: { 
      type: Boolean, 
      default: false 
    }
  },
  winner: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  isActive: { 
    type: Boolean, 
    default: true, 
    index: true 
  }
}, {
  timestamps: true
});

// Additional indexes for performance
RoomSchema.index({ gameState: 1, isActive: 1 });
RoomSchema.index({ currentPlayerCount: 1 });

// TTL index for automatic cleanup (2 hours of inactivity)
RoomSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 7200 });

export default mongoose.model<IRoom>('Room', RoomSchema);