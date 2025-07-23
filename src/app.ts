import express from 'express';
import cors from 'cors';
import gameRoutes from './routes/game';

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Routes
app.use('/api', gameRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'MindDigits API Server', 
    version: '1.0.0',
    status: 'running'
  });
});

export default app;