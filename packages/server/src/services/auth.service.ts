import bcrypt from 'bcrypt';
import { db } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

const SALT_ROUNDS = 10;

export interface AuthResult {
  userId: string;
  email: string;
}

export class AuthService {
  /**
   * Create a new user account
   */
  async signup(email: string, password: string, nickname: string): Promise<AuthResult> {
    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const pwHash = await bcrypt.hash(password, SALT_ROUNDS);

    return await db.transaction(async (client) => {
      // Check if email already exists
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Create user
      const userId = uuidv4();
      await client.query(
        'INSERT INTO users (id, email, pw_hash) VALUES ($1, $2, $3)',
        [userId, email.toLowerCase(), pwHash]
      );

      // Create profile
      await client.query(
        'INSERT INTO profiles (user_id, nickname) VALUES ($1, $2)',
        [userId, nickname]
      );

      // Create wallet
      await client.query(
        'INSERT INTO wallets (user_id, available_cents, escrow_cents) VALUES ($1, 0, 0)',
        [userId]
      );

      return { userId, email: email.toLowerCase() };
    });
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<AuthResult> {
    const result = await db.query(
      'SELECT id, email, pw_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.pw_hash);

    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    return { userId: user.id, email: user.email };
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<any> {
    const result = await db.query(
      `SELECT u.id, u.email, p.nickname, p.mmr_solo, p.mmr_duo, p.mmr_squad,
              p.kyc_status, w.available_cents, w.escrow_cents
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const authService = new AuthService();
