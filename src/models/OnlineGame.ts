import mongoose, { Schema, Document } from 'mongoose';

export interface IOnlineGame extends Document {
  roomId: string;
  player1Id: mongoose.Types.ObjectId;
  player2Id: mongoose.Types.ObjectId;
  gameState: 'DIGIT_SELECTION' | 'SECRET_SETTING' | 'PLAYING' | 'FINISHED';
  currentTurnPlayerId?: mongoose.Types.ObjectId;
  digits: number;
  player1Secret?: string;
  player2Secret?: string;
  player1Ready: boolean;
  player2Ready: boolean;
  moves: Array<{
    playerId: mongoose.Types.ObjectId;
    guess: string;
    bulls: number;
    cows: number;
    timestamp: Date;
  }>;
  winner?: mongoose.Types.ObjectId;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OnlineGameSchema: Schema = new Schema({
  roomId: { 
    type: String, 
    required: true, 
    index: true 
  },
  player1Id: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer', 
    required: true 
  },
  player2Id: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer', 
    required: true 
  },
  gameState: { 
    type: String, 
    enum: ['DIGIT_SELECTION', 'SECRET_SETTING', 'PLAYING', 'FINISHED'], 
    default: 'DIGIT_SELECTION',
    index: true 
  },
  currentTurnPlayerId: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  },
  digits: { 
    type: Number, 
    default: 4 
  },
  player1Secret: { 
    type: String 
  },
  player2Secret: { 
    type: String 
  },
  player1Ready: { 
    type: Boolean, 
    default: false 
  },
  player2Ready: { 
    type: Boolean, 
    default: false 
  },
  moves: [{
    playerId: { 
      type: Schema.Types.ObjectId, 
      ref: 'OnlinePlayer', 
      required: true 
    },
    guess: { 
      type: String, 
      required: true 
    },
    bulls: { 
      type: Number, 
      required: true 
    },
    cows: { 
      type: Number, 
      required: true 
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    }
  }],
  winner: { 
    type: Schema.Types.ObjectId, 
    ref: 'OnlinePlayer' 
  },
  startedAt: { 
    type: Date 
  },
  finishedAt: { 
    type: Date 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true
});

// Indexes for performance
OnlineGameSchema.index({ roomId: 1 });
OnlineGameSchema.index({ player1Id: 1 });
OnlineGameSchema.index({ player2Id: 1 });
OnlineGameSchema.index({ gameState: 1 });

// TTL index for automatic cleanup (24 hours)
OnlineGameSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model<IOnlineGame>('OnlineGame', OnlineGameSchema);