import mongoose, { Schema, Document } from 'mongoose';

export interface IOnlinePlayer extends Document {
  playerId: string;
  name: string;
  roomId: string;
  secret?: string;
  selectedDigits?: number;
  isReady: boolean;
  isConnected: boolean;
  isHost: boolean;
  guesses: Array<{
    guess: string;
    bulls: number;
    cows: number;
    timestamp: Date;
  }>;
  position: number; // 1 for first player, 2 for second player
  lastHeartbeat: Date;
  joinedAt: Date;
  createdAt: Date;
}

const OnlinePlayerSchema: Schema = new Schema({
  playerId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  name: { 
    type: String, 
    required: true, 
    maxlength: 20 
  },
  roomId: { 
    type: String, 
    required: true, 
    index: true 
  },
  secret: { 
    type: String 
  },
  selectedDigits: { 
    type: Number 
  },
  isReady: { 
    type: Boolean, 
    default: false 
  },
  isConnected: { 
    type: Boolean, 
    default: true 
  },
  isHost: { 
    type: Boolean, 
    default: false 
  },
  guesses: [{
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
  position: { 
    type: Number, 
    min: 1, 
    max: 2, 
    required: true 
  },
  lastHeartbeat: { 
    type: Date, 
    default: Date.now, 
    index: true 
  },
  joinedAt: { 
    type: Date, 
    default: Date.now 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for performance
OnlinePlayerSchema.index({ roomId: 1, position: 1 });
OnlinePlayerSchema.index({ isConnected: 1 });
OnlinePlayerSchema.index({ playerId: 1, roomId: 1 });

// TTL index for heartbeat cleanup (10 minutes)
OnlinePlayerSchema.index({ lastHeartbeat: 1 }, { expireAfterSeconds: 600 });

export default mongoose.model<IOnlinePlayer>('OnlinePlayer', OnlinePlayerSchema);