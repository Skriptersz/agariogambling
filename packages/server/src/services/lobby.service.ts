import { db } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { GameMode, PayoutModel, LobbyState, GAME_CONFIG } from '@agar/shared';
import { walletService } from './wallet.service';
import { provablyFairService } from './provably-fair.service';

export class LobbyService {
  /**
   * Create a new lobby
   */
  async createLobby(
    mode: GameMode,
    buyInCents: number,
    payoutModel: PayoutModel,
    region: string,
    rakeBps: number = GAME_CONFIG.DEFAULT_RAKE_BPS,
    rakeCapCents?: number,
    createdBy?: string
  ): Promise<string> {
    const lobbyId = uuidv4();

    await db.query(
      `INSERT INTO lobbies (id, mode, buy_in_cents, payout_model, region, state, rake_bps, rake_cap_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        lobbyId,
        mode,
        buyInCents,
        payoutModel,
        region,
        LobbyState.WAITING,
        rakeBps,
        rakeCapCents,
        createdBy,
      ]
    );

    return lobbyId;
  }

  /**
   * Get open lobbies
   */
  async getOpenLobbies(mode?: GameMode, buyInCents?: number): Promise<any[]> {
    let query = `
      SELECT l.*, COUNT(lp.user_id) as player_count
      FROM lobbies l
      LEFT JOIN lobby_players lp ON l.id = lp.lobby_id
      WHERE l.state = $1
    `;
    const params: any[] = [LobbyState.WAITING];

    if (mode) {
      params.push(mode);
      query += ` AND l.mode = $${params.length}`;
    }

    if (buyInCents) {
      params.push(buyInCents);
      query += ` AND l.buy_in_cents = $${params.length}`;
    }

    query += ` GROUP BY l.id ORDER BY l.created_at DESC LIMIT 50`;

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Join a lobby
   */
  async joinLobby(
    lobbyId: string,
    userId: string,
    teamNo: number = 0
  ): Promise<{ success: boolean; wsToken: string }> {
    return await db.transaction(async (client) => {
      // Get lobby info
      const lobby = await client.query(
        'SELECT * FROM lobbies WHERE id = $1 FOR UPDATE',
        [lobbyId]
      );

      if (lobby.rows.length === 0) {
        throw new Error('Lobby not found');
      }

      const lobbyData = lobby.rows[0];

      if (lobbyData.state !== LobbyState.WAITING) {
        throw new Error('Lobby is not accepting players');
      }

      // Check if player already in lobby
      const existing = await client.query(
        'SELECT * FROM lobby_players WHERE lobby_id = $1 AND user_id = $2',
        [lobbyId, userId]
      );

      if (existing.rows.length > 0) {
        throw new Error('Already in lobby');
      }

      // Check player count
      const playerCount = await client.query(
        'SELECT COUNT(*) as count FROM lobby_players WHERE lobby_id = $1',
        [lobbyId]
      );

      const maxPlayers = this.getMaxPlayers(lobbyData.mode);
      if (parseInt(playerCount.rows[0].count) >= maxPlayers) {
        throw new Error('Lobby is full');
      }

      // Lock funds in escrow
      await walletService.lockEscrow(userId, lobbyData.buy_in_cents, lobbyId);

      // Add player to lobby
      await client.query(
        'INSERT INTO lobby_players (lobby_id, user_id, team_no) VALUES ($1, $2, $3)',
        [lobbyId, userId, teamNo]
      );

      // Generate WebSocket token (JWT would be used in production)
      const wsToken = uuidv4();

      return { success: true, wsToken };
    });
  }

  /**
   * Leave a lobby (before match starts)
   */
  async leaveLobby(lobbyId: string, userId: string): Promise<void> {
    return await db.transaction(async (client) => {
      // Check lobby state
      const lobby = await client.query(
        'SELECT * FROM lobbies WHERE id = $1 FOR UPDATE',
        [lobbyId]
      );

      if (lobby.rows.length === 0) {
        throw new Error('Lobby not found');
      }

      if (lobby.rows[0].state !== LobbyState.WAITING) {
        throw new Error('Cannot leave lobby after match has started');
      }

      // Remove player
      await client.query(
        'DELETE FROM lobby_players WHERE lobby_id = $1 AND user_id = $2',
        [lobbyId, userId]
      );

      // Refund escrow
      await walletService.refundEscrow(userId, lobby.rows[0].buy_in_cents, lobbyId);
    });
  }

  /**
   * Start a match from a lobby
   */
  async startMatch(lobbyId: string): Promise<string> {
    return await db.transaction(async (client) => {
      // Get lobby
      const lobby = await client.query(
        'SELECT * FROM lobbies WHERE id = $1 FOR UPDATE',
        [lobbyId]
      );

      if (lobby.rows.length === 0) {
        throw new Error('Lobby not found');
      }

      const lobbyData = lobby.rows[0];

      // Get players
      const players = await client.query(
        'SELECT user_id, team_no FROM lobby_players WHERE lobby_id = $1',
        [lobbyId]
      );

      if (players.rows.length === 0) {
        throw new Error('No players in lobby');
      }

      // Generate provably fair commitment
      const { seed, nonce, commit } = provablyFairService.generateCommitment();

      // Calculate pot and rake
      const pot = lobbyData.buy_in_cents * players.rows.length;
      const rake = Math.min(
        Math.floor((pot * lobbyData.rake_bps) / 10000),
        lobbyData.rake_cap_cents || Infinity
      );
      const netPot = pot - rake;

      // Create match
      const matchId = uuidv4();
      await client.query(
        `INSERT INTO matches (id, lobby_id, seed, nonce, commit, payout_model, rake_bps, pot_cents, rake_cents, net_pot_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          matchId,
          lobbyId,
          seed,
          nonce,
          commit,
          lobbyData.payout_model,
          lobbyData.rake_bps,
          pot,
          rake,
          netPot,
        ]
      );

      // Update lobby state
      await client.query(
        'UPDATE lobbies SET state = $1, started_at = NOW() WHERE id = $2',
        [LobbyState.ACTIVE, lobbyId]
      );

      return matchId;
    });
  }

  private getMaxPlayers(mode: GameMode): number {
    switch (mode) {
      case GameMode.SOLO:
        return 20;
      case GameMode.DUO:
        return 20;
      case GameMode.SQUAD:
        return 20;
      default:
        return 20;
    }
  }
}

export const lobbyService = new LobbyService();
