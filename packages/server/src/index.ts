import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { authService } from './services/auth.service';
import { walletService } from './services/wallet.service';
import { lobbyService } from './services/lobby.service';
import { redisService } from './services/redis.service';

dotenv.config();

const fastify = Fastify({
  logger: true,
});

// Register plugins
fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || '*',
});

fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'supersecret-change-in-production',
});

// Auth middleware
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Auth endpoints
fastify.post('/auth/signup', async (request, reply) => {
  const { email, password, nickname } = request.body as any;

  try {
    const result = await authService.signup(email, password, nickname);
    const token = fastify.jwt.sign({ userId: result.userId, email: result.email });
    const refreshToken = fastify.jwt.sign(
      { userId: result.userId },
      { expiresIn: '30d' }
    );

    return { token, refreshToken, userId: result.userId };
  } catch (error: any) {
    reply.code(400).send({ error: error.message });
  }
});

fastify.post('/auth/login', async (request, reply) => {
  const { email, password } = request.body as any;

  try {
    const result = await authService.login(email, password);
    const token = fastify.jwt.sign({ userId: result.userId, email: result.email });
    const refreshToken = fastify.jwt.sign(
      { userId: result.userId },
      { expiresIn: '30d' }
    );

    return { token, refreshToken, userId: result.userId };
  } catch (error: any) {
    reply.code(401).send({ error: error.message });
  }
});

fastify.get('/me', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    try {
      const profile = await authService.getUserProfile(user.userId);
      return profile;
    } catch (error: any) {
      reply.code(404).send({ error: error.message });
    }
  },
});

// Wallet endpoints
fastify.get('/wallet', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    try {
      const balance = await walletService.getBalance(user.userId);
      return balance;
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  },
});

fastify.post('/wallet/deposit', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    const { amount, method } = request.body as any;

    try {
      const txId = await walletService.deposit(user.userId, amount, { method });
      return { txId, success: true };
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  },
});

fastify.post('/wallet/withdraw', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    const { amount, method } = request.body as any;

    try {
      const txId = await walletService.withdraw(user.userId, amount, method);
      return { txId, success: true };
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  },
});

fastify.get('/wallet/history', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    const { cursor, limit } = request.query as any;

    try {
      const history = await walletService.getTransactionHistory(
        user.userId,
        limit ? parseInt(limit) : 50,
        cursor
      );
      return { transactions: history };
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  },
});

// Lobby endpoints
fastify.get('/lobbies', async (request, reply) => {
  const { mode, buyIn } = request.query as any;

  try {
    const lobbies = await lobbyService.getOpenLobbies(mode, buyIn ? parseInt(buyIn) : undefined);
    return { lobbies };
  } catch (error: any) {
    reply.code(500).send({ error: error.message });
  }
});

fastify.post('/lobbies/:id/join', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as any;

    try {
      const result = await lobbyService.joinLobby(id, user.userId);
      return result;
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  },
});

fastify.post('/lobbies/:id/leave', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as any;

    try {
      await lobbyService.leaveLobby(id, user.userId);
      return { success: true };
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  },
});

// Admin endpoints (TODO: add admin auth check)
fastify.post('/admin/lobbies', {
  preHandler: [fastify.authenticate as any],
  handler: async (request, reply) => {
    const { mode, buyInCents, payoutModel, region, rakeBps, rakeCapCents } = request.body as any;
    const user = (request as any).user;

    try {
      const lobbyId = await lobbyService.createLobby(
        mode,
        buyInCents,
        payoutModel,
        region,
        rakeBps,
        rakeCapCents,
        user.userId
      );
      return { lobbyId };
    } catch (error: any) {
      reply.code(400).send({ error: error.message });
    }
  },
});

// Start server
const start = async () => {
  try {
    await redisService.connect();

    const port = parseInt(process.env.PORT || '3000');
    await fastify.listen({ port, host: '0.0.0.0' });

    console.log(`Server listening on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
