import { PoolClient } from 'pg';
import { db } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { WalletTransactionType, WalletTransactionStatus } from '@agar/shared';

export interface WalletBalance {
  availableCents: number;
  escrowCents: number;
}

export class WalletService {
  /**
   * Get wallet balance for a user
   */
  async getBalance(userId: string): Promise<WalletBalance> {
    const result = await db.query<{ available_cents: string; escrow_cents: string }>(
      'SELECT available_cents, escrow_cents FROM wallets WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create wallet if it doesn't exist
      await db.query(
        'INSERT INTO wallets (user_id, available_cents, escrow_cents) VALUES ($1, 0, 0)',
        [userId]
      );
      return { availableCents: 0, escrowCents: 0 };
    }

    return {
      availableCents: parseInt(result.rows[0].available_cents),
      escrowCents: parseInt(result.rows[0].escrow_cents),
    };
  }

  /**
   * Deposit funds (sandbox/real PSP integration)
   */
  async deposit(
    userId: string,
    amountCents: number,
    ref: Record<string, any>,
    idempotencyKey?: string
  ): Promise<string> {
    if (amountCents <= 0) {
      throw new Error('Deposit amount must be positive');
    }

    return await db.transaction(async (client) => {
      // Check idempotency
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status FROM wallet_tx WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          if (existing.rows[0].status === 'COMPLETED') {
            return existing.rows[0].id;
          }
          throw new Error('Transaction already in progress');
        }
      }

      // Create transaction record
      const txId = uuidv4();
      await client.query(
        `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          txId,
          userId,
          WalletTransactionType.DEPOSIT,
          amountCents,
          WalletTransactionStatus.PENDING,
          JSON.stringify(ref),
          idempotencyKey,
        ]
      );

      // Update wallet balance
      await client.query(
        `UPDATE wallets
         SET available_cents = available_cents + $1, version = version + 1
         WHERE user_id = $2`,
        [amountCents, userId]
      );

      // Mark transaction as completed
      await client.query(
        'UPDATE wallet_tx SET status = $1 WHERE id = $2',
        [WalletTransactionStatus.COMPLETED, txId]
      );

      return txId;
    });
  }

  /**
   * Withdraw funds (requires KYC)
   */
  async withdraw(
    userId: string,
    amountCents: number,
    method: string,
    idempotencyKey?: string
  ): Promise<string> {
    if (amountCents <= 0) {
      throw new Error('Withdrawal amount must be positive');
    }

    return await db.transaction(async (client) => {
      // Check KYC status
      const kycCheck = await client.query(
        'SELECT kyc_status FROM profiles WHERE user_id = $1',
        [userId]
      );
      if (kycCheck.rows.length === 0 || kycCheck.rows[0].kyc_status !== 'APPROVED') {
        throw new Error('KYC approval required for withdrawals');
      }

      // Check idempotency
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status FROM wallet_tx WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existing.rows.length > 0) {
          if (existing.rows[0].status === 'COMPLETED') {
            return existing.rows[0].id;
          }
          throw new Error('Transaction already in progress');
        }
      }

      // Check balance
      const balance = await client.query<{ available_cents: string }>(
        'SELECT available_cents FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      if (balance.rows.length === 0 || parseInt(balance.rows[0].available_cents) < amountCents) {
        throw new Error('Insufficient balance');
      }

      // Create transaction record
      const txId = uuidv4();
      await client.query(
        `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          txId,
          userId,
          WalletTransactionType.WITHDRAWAL,
          -amountCents,
          WalletTransactionStatus.PENDING,
          JSON.stringify({ method }),
          idempotencyKey,
        ]
      );

      // Update wallet balance
      await client.query(
        `UPDATE wallets
         SET available_cents = available_cents - $1, version = version + 1
         WHERE user_id = $2`,
        [amountCents, userId]
      );

      // Mark transaction as completed (PSP processing would be async in production)
      await client.query(
        'UPDATE wallet_tx SET status = $1 WHERE id = $2',
        [WalletTransactionStatus.COMPLETED, txId]
      );

      return txId;
    });
  }

  /**
   * Lock funds in escrow (when joining a match)
   */
  async lockEscrow(userId: string, amountCents: number, matchId: string): Promise<void> {
    if (amountCents <= 0) {
      throw new Error('Escrow amount must be positive');
    }

    await db.transaction(async (client) => {
      // Check available balance
      const balance = await client.query<{ available_cents: string }>(
        'SELECT available_cents FROM wallets WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      if (balance.rows.length === 0 || parseInt(balance.rows[0].available_cents) < amountCents) {
        throw new Error('Insufficient balance for buy-in');
      }

      // Move from available to escrow
      await client.query(
        `UPDATE wallets
         SET available_cents = available_cents - $1,
             escrow_cents = escrow_cents + $1,
             version = version + 1
         WHERE user_id = $2`,
        [amountCents, userId]
      );

      // Record transaction
      const txId = uuidv4();
      await client.query(
        `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          txId,
          userId,
          WalletTransactionType.ESCROW_LOCK,
          amountCents,
          WalletTransactionStatus.COMPLETED,
          JSON.stringify({ matchId }),
        ]
      );
    });
  }

  /**
   * Release escrow and refund (if match cancelled before start)
   */
  async refundEscrow(userId: string, amountCents: number, matchId: string): Promise<void> {
    await db.transaction(async (client) => {
      // Move from escrow back to available
      await client.query(
        `UPDATE wallets
         SET available_cents = available_cents + $1,
             escrow_cents = escrow_cents - $1,
             version = version + 1
         WHERE user_id = $2`,
        [amountCents, userId]
      );

      // Record transaction
      const txId = uuidv4();
      await client.query(
        `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          txId,
          userId,
          WalletTransactionType.REFUND,
          amountCents,
          WalletTransactionStatus.COMPLETED,
          JSON.stringify({ matchId }),
        ]
      );
    });
  }

  /**
   * Settle match payouts (called at match end)
   */
  async settleMatch(
    matchId: string,
    payouts: Array<{ userId: string; payoutCents: number }>,
    rakeCents: number
  ): Promise<void> {
    await db.transaction(async (client) => {
      // Calculate total escrow that should be released
      const totalPayout = payouts.reduce((sum, p) => sum + p.payoutCents, 0);
      const totalEscrow = totalPayout + rakeCents;

      // Process each payout
      for (const { userId, payoutCents } of payouts) {
        // Release escrow and add payout to available
        await client.query(
          `UPDATE wallets
           SET escrow_cents = escrow_cents - $1,
               available_cents = available_cents + $2,
               version = version + 1
           WHERE user_id = $3`,
          [totalEscrow / payouts.length, payoutCents, userId]
        );

        // Record payout transaction
        const txId = uuidv4();
        await client.query(
          `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            txId,
            userId,
            WalletTransactionType.PAYOUT,
            payoutCents,
            WalletTransactionStatus.COMPLETED,
            JSON.stringify({ matchId }),
          ]
        );
      }

      // Record rake collection (house revenue)
      const rakeTxId = uuidv4();
      await client.query(
        `INSERT INTO wallet_tx (id, user_id, type, amount_cents, status, ref)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rakeTxId,
          '00000000-0000-0000-0000-000000000000', // special house user ID
          WalletTransactionType.RAKE,
          rakeCents,
          WalletTransactionStatus.COMPLETED,
          JSON.stringify({ matchId }),
        ]
      );
    });
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    cursor?: string
  ): Promise<any[]> {
    const query = cursor
      ? `SELECT * FROM wallet_tx WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`
      : `SELECT * FROM wallet_tx WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`;

    const params = cursor ? [userId, cursor, limit] : [userId, limit];
    const result = await db.query(query, params);

    return result.rows;
  }
}

export const walletService = new WalletService();
