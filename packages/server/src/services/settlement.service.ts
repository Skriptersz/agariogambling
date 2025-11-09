import { db } from '../db/pool';
import { walletService } from './wallet.service';

export interface MatchResult {
  userId: string;
  placement: number;
  finalMass: number;
  maxMass: number;
  payoutCents: number;
}

export class SettlementService {
  /**
   * Settle a completed match
   * - Save match results to database
   * - Process payouts via wallet service
   * - Update player stats (MMR, etc.)
   */
  async settleMatch(
    matchId: string,
    results: MatchResult[],
    seed: string,
    nonce: string
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Get match info
      const match = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [
        matchId,
      ]);

      if (match.rows.length === 0) {
        throw new Error('Match not found');
      }

      const matchData = match.rows[0];

      // Verify not already settled
      if (matchData.ended_at) {
        throw new Error('Match already settled');
      }

      // Save match results
      for (const result of results) {
        await client.query(
          `INSERT INTO match_players (match_id, user_id, team_no, placement, max_mass, final_mass, payout_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            matchId,
            result.userId,
            0, // TODO: get actual team number
            result.placement,
            result.maxMass,
            result.finalMass,
            result.payoutCents,
          ]
        );
      }

      // Update match as ended
      await client.query(
        'UPDATE matches SET ended_at = NOW(), seed = $1, nonce = $2 WHERE id = $3',
        [seed, nonce, matchId]
      );

      // Update lobby state
      await client.query(
        'UPDATE lobbies SET state = $1, ended_at = NOW() WHERE id = $2',
        ['COMPLETED', matchData.lobby_id]
      );

      // Process payouts through wallet service
      const payouts = results.map((r) => ({
        userId: r.userId,
        payoutCents: r.payoutCents,
      }));

      await walletService.settleMatch(matchId, payouts, matchData.rake_cents);

      // Update player MMR (simplified)
      await this.updatePlayerMMR(client, matchData, results);
    });
  }

  /**
   * Update player MMR based on match results
   * Simplified ELO-like system
   */
  private async updatePlayerMMR(client: any, matchData: any, results: MatchResult[]): Promise<void> {
    const mode = matchData.payout_model; // Assuming mode is stored
    const mmrField = `mmr_solo`; // Simplified - should map mode to MMR field

    for (const result of results) {
      // Calculate MMR change based on placement
      const playerCount = results.length;
      const expectedPlacement = (playerCount + 1) / 2; // Middle
      const actualPlacement = result.placement;

      // Simple formula: gain/lose based on placement vs expected
      const k = 32; // K-factor
      const mmrChange = Math.floor(k * (expectedPlacement - actualPlacement) / playerCount);

      await client.query(
        `UPDATE profiles SET ${mmrField} = ${mmrField} + $1 WHERE user_id = $2`,
        [mmrChange, result.userId]
      );
    }
  }

  /**
   * Refund a match (if it crashed or was cancelled)
   */
  async refundMatch(matchId: string, reason: string): Promise<void> {
    await db.transaction(async (client) => {
      // Get match info
      const match = await client.query('SELECT * FROM matches WHERE id = $1', [matchId]);

      if (match.rows.length === 0) {
        throw new Error('Match not found');
      }

      const matchData = match.rows[0];

      // Get all players in lobby
      const players = await client.query(
        'SELECT user_id FROM lobby_players WHERE lobby_id = $1',
        [matchData.lobby_id]
      );

      // Get lobby to find buy-in amount
      const lobby = await client.query('SELECT buy_in_cents FROM lobbies WHERE id = $1', [
        matchData.lobby_id,
      ]);

      const buyInCents = lobby.rows[0].buy_in_cents;

      // Refund all players
      for (const player of players.rows) {
        await walletService.refundEscrow(player.user_id, buyInCents, matchId);
      }

      // Mark match as refunded
      await client.query(
        'UPDATE matches SET ended_at = NOW() WHERE id = $1',
        [matchId]
      );

      // Update lobby state
      await client.query(
        'UPDATE lobbies SET state = $1, ended_at = NOW() WHERE id = $2',
        ['COMPLETED', matchData.lobby_id]
      );
    });
  }

  /**
   * Get match results
   */
  async getMatchResults(matchId: string): Promise<any> {
    const result = await db.query(
      `SELECT m.*, mp.user_id, mp.placement, mp.final_mass, mp.payout_cents, p.nickname
       FROM matches m
       LEFT JOIN match_players mp ON m.id = mp.match_id
       LEFT JOIN profiles p ON mp.user_id = p.user_id
       WHERE m.id = $1
       ORDER BY mp.placement`,
      [matchId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const match = result.rows[0];
    return {
      matchId: match.id,
      lobbyId: match.lobby_id,
      commit: match.commit,
      seed: match.seed,
      nonce: match.nonce,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      potCents: match.pot_cents,
      rakeCents: match.rake_cents,
      netPotCents: match.net_pot_cents,
      players: result.rows.map((r) => ({
        userId: r.user_id,
        nickname: r.nickname,
        placement: r.placement,
        finalMass: parseFloat(r.final_mass),
        payoutCents: r.payout_cents,
      })),
    };
  }
}

export const settlementService = new SettlementService();
