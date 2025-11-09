import { createClient, RedisClientType } from 'redis';

export class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    this.client.on('error', (err) => console.error('Redis Client Error', err));
    this.client.on('connect', () => {
      console.log('Redis connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  // Lobby Management
  async addToLobby(lobbyId: string, userId: string, data: any): Promise<void> {
    await this.client.hSet(`lobby:${lobbyId}:players`, userId, JSON.stringify(data));
  }

  async removeFromLobby(lobbyId: string, userId: string): Promise<void> {
    await this.client.hDel(`lobby:${lobbyId}:players`, userId);
  }

  async getLobbyPlayers(lobbyId: string): Promise<Map<string, any>> {
    const players = await this.client.hGetAll(`lobby:${lobbyId}:players`);
    const result = new Map();
    for (const [userId, data] of Object.entries(players)) {
      result.set(userId, JSON.parse(data));
    }
    return result;
  }

  async setLobbyState(lobbyId: string, state: any): Promise<void> {
    await this.client.set(`lobby:${lobbyId}:state`, JSON.stringify(state), {
      EX: 3600, // 1 hour expiry
    });
  }

  async getLobbyState(lobbyId: string): Promise<any | null> {
    const state = await this.client.get(`lobby:${lobbyId}:state`);
    return state ? JSON.parse(state) : null;
  }

  // Matchmaking Queue
  async addToMatchmakingQueue(
    mode: string,
    buyIn: number,
    userId: string,
    mmr: number
  ): Promise<void> {
    const queueKey = `queue:${mode}:${buyIn}`;
    await this.client.zAdd(queueKey, {
      score: Date.now(),
      value: JSON.stringify({ userId, mmr }),
    });
  }

  async removeFromMatchmakingQueue(mode: string, buyIn: number, userId: string): Promise<void> {
    const queueKey = `queue:${mode}:${buyIn}`;
    const members = await this.client.zRange(queueKey, 0, -1);
    for (const member of members) {
      const data = JSON.parse(member);
      if (data.userId === userId) {
        await this.client.zRem(queueKey, member);
        break;
      }
    }
  }

  async getMatchmakingQueue(mode: string, buyIn: number, limit: number = 50): Promise<any[]> {
    const queueKey = `queue:${mode}:${buyIn}`;
    const members = await this.client.zRange(queueKey, 0, limit - 1);
    return members.map((m) => JSON.parse(m));
  }

  // Game State Caching (for active matches)
  async setGameState(matchId: string, state: any): Promise<void> {
    await this.client.set(`game:${matchId}:state`, JSON.stringify(state), {
      EX: 600, // 10 minutes
    });
  }

  async getGameState(matchId: string): Promise<any | null> {
    const state = await this.client.get(`game:${matchId}:state`);
    return state ? JSON.parse(state) : null;
  }

  // Rate Limiting
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const current = await this.client.incr(key);
    if (current === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return current;
  }

  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const current = await this.incrementRateLimit(key, windowSeconds);
    return current <= limit;
  }

  // Session Management
  async setSession(sessionId: string, data: any, expirySeconds: number = 3600): Promise<void> {
    await this.client.set(`session:${sessionId}`, JSON.stringify(data), {
      EX: expirySeconds,
    });
  }

  async getSession(sessionId: string): Promise<any | null> {
    const data = await this.client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  // Pub/Sub for game events
  async publish(channel: string, message: any): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    const subscriber = this.client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, (message) => {
      callback(JSON.parse(message));
    });
  }
}

export const redisService = new RedisService();
