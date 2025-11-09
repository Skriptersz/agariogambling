import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { Match, MatchConfig } from './game/match';
import {
  WSMessageType,
  WSInputMessage,
  GAME_CONFIG,
  LobbyState,
  WSResultMessage,
} from '@agar/shared';

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Store active matches
const activeMatches = new Map<string, Match>();
const matchIntervals = new Map<string, NodeJS.Timeout>();

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const matchId = socket.handshake.query.matchId as string;

  // TODO: Verify JWT token and check if user is in match
  if (!token || !matchId) {
    return next(new Error('Authentication error'));
  }

  // Store user context
  socket.data.userId = 'user-' + token; // Simplified - should decode JWT
  socket.data.matchId = matchId;

  next();
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.data.userId} to match ${socket.data.matchId}`);

  const matchId = socket.data.matchId;
  const userId = socket.data.userId;

  // Join match room
  socket.join(matchId);

  // Get or create match
  let match = activeMatches.get(matchId);
  if (!match) {
    console.error(`Match ${matchId} not found`);
    socket.disconnect();
    return;
  }

  // Find player ID in match
  let playerId: string | null = null;
  for (const [id, player] of match.getPlayers()) {
    if (player.userId === userId) {
      playerId = id;
      break;
    }
  }

  if (!playerId) {
    console.error(`Player ${userId} not in match ${matchId}`);
    socket.disconnect();
    return;
  }

  // Handle auth message
  socket.on('message', (data: any) => {
    try {
      if (data.type === WSMessageType.AUTH) {
        socket.emit('message', { type: 'AUTH_OK' });
      }
    } catch (error) {
      console.error('Auth message error:', error);
    }
  });

  // Handle player input
  socket.on('input', (data: WSInputMessage) => {
    try {
      if (playerId && match) {
        match.updatePlayerInput(playerId, data.axes, data.boost);
      }
    } catch (error) {
      console.error('Input error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${userId} from match ${matchId}`);
    // Handle reconnection logic here
  });
});

/**
 * Create and start a new match
 */
export function createMatch(config: MatchConfig): void {
  const match = new Match(config);
  activeMatches.set(config.matchId, match);

  // Start countdown
  match.startCountdown();

  // Listen to match events
  match.onEvent((event) => {
    io.to(config.matchId).emit('event', event);
  });

  // Start game loop at 30 Hz
  const tickInterval = 1000 / GAME_CONFIG.TICK_RATE;
  const interval = setInterval(() => {
    try {
      match.update();

      // Broadcast snapshot to all players
      const snapshot = match.getSnapshot();
      io.to(config.matchId).emit('snapshot', snapshot);

      // Check if match ended
      if (match.getState() === LobbyState.SETTLEMENT) {
        endMatch(config.matchId);
      }
    } catch (error) {
      console.error('Game loop error:', error);
    }
  }, tickInterval);

  matchIntervals.set(config.matchId, interval);

  console.log(`Match ${config.matchId} started with ${config.players.length} players`);
}

/**
 * End a match and handle settlement
 */
async function endMatch(matchId: string): Promise<void> {
  const match = activeMatches.get(matchId);
  if (!match) return;

  // Stop game loop
  const interval = matchIntervals.get(matchId);
  if (interval) {
    clearInterval(interval);
    matchIntervals.delete(matchId);
  }

  // Calculate results
  const results = match.calculateResults();

  // Send results to players
  const resultMessage: WSResultMessage = {
    type: WSMessageType.RESULT,
    placements: results.map((r) => ({
      userId: r.userId,
      placement: r.placement,
      finalMass: r.finalMass,
      payoutCents: r.payoutCents,
    })),
    seed: '', // TODO: get from match
    nonce: '',
    commit: '',
  };

  io.to(matchId).emit('result', resultMessage);

  // TODO: Call settlement service to process payouts
  // await settlementService.settleMatch(matchId, results);

  // Clean up
  setTimeout(() => {
    activeMatches.delete(matchId);
    console.log(`Match ${matchId} cleaned up`);
  }, 10000); // Keep for 10 seconds for players to see results
}

// Start WebSocket server
const PORT = parseInt(process.env.GAME_SERVER_PORT || '3001');
httpServer.listen(PORT, () => {
  console.log(`Game server listening on port ${PORT}`);
});

// Export for external match creation
export { activeMatches };
