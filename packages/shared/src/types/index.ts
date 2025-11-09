// Game Types
export enum GameMode {
  SOLO = 'SOLO',
  DUO = 'DUO',
  SQUAD = 'SQUAD'
}

export enum PayoutModel {
  WINNER_TAKE_ALL = 'WINNER_TAKE_ALL',
  TOP_3_LADDER = 'TOP_3_LADDER',
  PROPORTIONAL = 'PROPORTIONAL'
}

export enum LobbyState {
  WAITING = 'WAITING',
  COUNTDOWN = 'COUNTDOWN',
  ACTIVE = 'ACTIVE',
  SUDDEN_SHRINK = 'SUDDEN_SHRINK',
  SETTLEMENT = 'SETTLEMENT',
  COMPLETED = 'COMPLETED'
}

export enum KYCStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum WalletTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ESCROW_LOCK = 'ESCROW_LOCK',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
  PAYOUT = 'PAYOUT',
  RAKE = 'RAKE',
  REFUND = 'REFUND'
}

export enum WalletTransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// API Types
export interface User {
  id: string;
  email: string;
  createdAt: Date;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  mmrSolo: number;
  mmrDuo: number;
  mmrSquad: number;
  kycStatus: KYCStatus;
}

export interface Wallet {
  userId: string;
  availableCents: number;
  escrowCents: number;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amountCents: number;
  status: WalletTransactionStatus;
  ref: Record<string, any>;
  createdAt: Date;
}

export interface Lobby {
  id: string;
  mode: GameMode;
  buyInCents: number;
  payoutModel: PayoutModel;
  region: string;
  state: LobbyState;
  rakeBps: number;
  rakeCapCents: number;
  createdBy: string;
  createdAt: Date;
  playerCount: number;
  maxPlayers: number;
}

export interface Match {
  id: string;
  lobbyId: string;
  seed: string;
  nonce: string;
  commit: string;
  startedAt: Date;
  endedAt?: Date;
  payoutModel: PayoutModel;
  rakeBps: number;
  potCents: number;
  rakeCents: number;
  netPotCents: number;
}

export interface MatchPlayer {
  matchId: string;
  userId: string;
  teamNo: number;
  placement: number;
  maxMass: number;
  finalMass: number;
  payoutCents: number;
}

// Game Physics Types
export interface Vector2D {
  x: number;
  y: number;
}

export interface Circle {
  pos: Vector2D;
  radius: number;
  mass: number;
}

export interface Player extends Circle {
  id: string;
  userId: string;
  teamNo: number;
  velocity: Vector2D;
  inputAxes: Vector2D;
  boost: boolean;
  lastBoostTime: number;
  isDead: boolean;
  kills: number;
}

export interface Pellet extends Circle {
  id: string;
  consumed: boolean;
}

export interface GameState {
  tick: number;
  players: Map<string, Player>;
  pellets: Map<string, Pellet>;
  fogRadius: number;
  bounties: Array<{ playerId: string; pos: Vector2D; expiresAt: number }>;
}

// WebSocket Protocol
export enum WSMessageType {
  AUTH = 'AUTH',
  INPUT = 'INPUT',
  SNAPSHOT = 'SNAPSHOT',
  EVENT = 'EVENT',
  RECONCILE = 'RECONCILE',
  RESULT = 'RESULT'
}

export enum WSEventType {
  COUNTDOWN = 'COUNTDOWN',
  KILL = 'KILL',
  SHRINK = 'SHRINK',
  END = 'END'
}

export interface WSAuthMessage {
  type: WSMessageType.AUTH;
  token: string;
}

export interface WSInputMessage {
  type: WSMessageType.INPUT;
  seq: number;
  axes: Vector2D;
  boost: boolean;
  ts: number;
}

export interface WSSnapshotMessage {
  type: WSMessageType.SNAPSHOT;
  tick: number;
  players: Array<{
    id: string;
    pos: Vector2D;
    radius: number;
    mass: number;
    teamNo: number;
    isDead: boolean;
  }>;
  pellets: Array<{
    id: string;
    pos: Vector2D;
    radius: number;
  }>;
  fogRadius: number;
  bounties: Array<{ playerId: string; pos: Vector2D; expiresAt: number }>;
}

export interface WSEventMessage {
  type: WSMessageType.EVENT;
  eventType: WSEventType;
  data: any;
}

export interface WSReconcileMessage {
  type: WSMessageType.RECONCILE;
  yourState: any;
  serverTick: number;
}

export interface WSResultMessage {
  type: WSMessageType.RESULT;
  placements: Array<{
    userId: string;
    placement: number;
    finalMass: number;
    payoutCents: number;
  }>;
  seed: string;
  nonce: string;
  commit: string;
}

export type WSMessage =
  | WSAuthMessage
  | WSInputMessage
  | WSSnapshotMessage
  | WSEventMessage
  | WSReconcileMessage
  | WSResultMessage;

// Constants
export const GAME_CONFIG = {
  TICK_RATE: 30,
  MATCH_DURATION_MS: 6 * 60 * 1000, // 6 minutes
  NORMAL_PHASE_MS: 4.5 * 60 * 1000, // 4.5 minutes
  SHRINK_PHASE_MS: 1.5 * 60 * 1000, // 1.5 minutes
  BOOST_COOLDOWN_MS: 6000,
  MASS_TO_RADIUS_K: 1.0,
  COLLISION_SIZE_RATIO: 1.15,
  GROWTH_CAP_MULTIPLIER: 5.0,
  DEFAULT_RAKE_BPS: 800, // 8%
  INITIAL_PLAYER_MASS: 10,
  PELLET_MASS: 1,
  MAX_VELOCITY: 5.0,
  FRICTION: 0.9
};

export const BUY_IN_AMOUNTS = [1000, 2000, 5000]; // in cents: $10, $20, $50

export const MAX_PLAYERS = {
  [GameMode.SOLO]: 20,
  [GameMode.DUO]: 20, // 10 teams
  [GameMode.SQUAD]: 20 // 5 teams
};
