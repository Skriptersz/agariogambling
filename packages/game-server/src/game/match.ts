import { v4 as uuidv4 } from 'uuid';
import {
  Player,
  Pellet,
  GameMode,
  PayoutModel,
  LobbyState,
  GAME_CONFIG,
  Vector2D,
  WSSnapshotMessage,
  WSEventMessage,
  WSMessageType,
  WSEventType,
} from '@agar/shared';
import { PhysicsEngine } from '../physics/engine';

export interface MatchConfig {
  matchId: string;
  lobbyId: string;
  mode: GameMode;
  buyInCents: number;
  payoutModel: PayoutModel;
  rakeBps: number;
  rakeCapCents: number;
  seed: string;
  nonce: string;
  commit: string;
  mapRadius: number;
  players: Array<{ userId: string; teamNo: number }>;
}

export class Match {
  private matchId: string;
  private lobbyId: string;
  private config: MatchConfig;
  private physics: PhysicsEngine;

  private state: LobbyState = LobbyState.COUNTDOWN;
  private tick: number = 0;
  private startTime: number = 0;
  private countdownStartTime: number = 0;

  private players: Map<string, Player> = new Map();
  private pellets: Map<string, Pellet> = new Map();
  private fogRadius: number;
  private growthCap: number;

  private eventCallbacks: Array<(event: any) => void> = [];

  constructor(config: MatchConfig) {
    this.config = config;
    this.matchId = config.matchId;
    this.lobbyId = config.lobbyId;
    this.physics = new PhysicsEngine();
    this.fogRadius = config.mapRadius;
    this.growthCap = config.buyInCents * GAME_CONFIG.GROWTH_CAP_MULTIPLIER;

    this.initializePlayers();
    this.initializePellets();
  }

  private initializePlayers(): void {
    // Use seeded RNG for spawn positions
    const rng = this.createSeededRNG();

    for (const playerData of this.config.players) {
      const spawnPos = this.randomPointInCircle(rng, this.config.mapRadius * 0.7);

      const player: Player = {
        id: uuidv4(),
        userId: playerData.userId,
        teamNo: playerData.teamNo,
        pos: spawnPos,
        radius: this.physics.massToRadius(GAME_CONFIG.INITIAL_PLAYER_MASS),
        mass: GAME_CONFIG.INITIAL_PLAYER_MASS,
        velocity: { x: 0, y: 0 },
        inputAxes: { x: 0, y: 0 },
        boost: false,
        lastBoostTime: 0,
        isDead: false,
        kills: 0,
      };

      this.players.set(player.id, player);
    }
  }

  private initializePellets(): void {
    const rng = this.createSeededRNG();
    const pelletCount = 500; // Fixed number of initial pellets

    for (let i = 0; i < pelletCount; i++) {
      this.spawnPellet(rng);
    }
  }

  private spawnPellet(rng: () => number): void {
    const pos = this.randomPointInCircle(rng, this.config.mapRadius);
    const pellet: Pellet = {
      id: uuidv4(),
      pos,
      radius: this.physics.massToRadius(GAME_CONFIG.PELLET_MASS),
      mass: GAME_CONFIG.PELLET_MASS,
      consumed: false,
    };
    this.pellets.set(pellet.id, pellet);
  }

  private createSeededRNG(): () => number {
    let state = this.seedToNumber(this.config.seed);
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  private seedToNumber(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private randomPointInCircle(rng: () => number, radius: number): Vector2D {
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    };
  }

  public startCountdown(): void {
    this.state = LobbyState.COUNTDOWN;
    this.countdownStartTime = Date.now();
    this.emitEvent({
      type: WSMessageType.EVENT,
      eventType: WSEventType.COUNTDOWN,
      data: { seconds: 10 },
    });
  }

  public startMatch(): void {
    this.state = LobbyState.ACTIVE;
    this.startTime = Date.now();
  }

  public updatePlayerInput(playerId: string, axes: Vector2D, boost: boolean): void {
    const player = this.players.get(playerId);
    if (player) {
      player.inputAxes = axes;
      player.boost = boost;
    }
  }

  public update(): void {
    this.tick++;
    const now = Date.now();
    const deltaTime = 1 / GAME_CONFIG.TICK_RATE;

    // Check state transitions
    if (this.state === LobbyState.COUNTDOWN) {
      if (now - this.countdownStartTime >= 10000) {
        this.startMatch();
      }
      return; // Don't process physics during countdown
    }

    if (this.state === LobbyState.ACTIVE) {
      const elapsed = now - this.startTime;
      if (elapsed >= GAME_CONFIG.NORMAL_PHASE_MS) {
        this.state = LobbyState.SUDDEN_SHRINK;
        this.emitEvent({
          type: WSMessageType.EVENT,
          eventType: WSEventType.SHRINK,
          data: {},
        });
      }
    }

    if (this.state === LobbyState.SUDDEN_SHRINK) {
      const elapsed = now - this.startTime;
      if (elapsed >= GAME_CONFIG.MATCH_DURATION_MS) {
        this.endMatch();
        return;
      }

      // Update fog radius (shrink)
      const shrinkProgress =
        (elapsed - GAME_CONFIG.NORMAL_PHASE_MS) / GAME_CONFIG.SHRINK_PHASE_MS;
      this.fogRadius =
        this.config.mapRadius * (1 - shrinkProgress * 0.65); // shrink to 35%
    }

    // Update all players
    for (const player of this.players.values()) {
      this.physics.updatePlayer(player, deltaTime);
      this.physics.constrainToMap(player, this.config.mapRadius);
      if (this.state === LobbyState.SUDDEN_SHRINK) {
        this.physics.applyFogDamage(player, this.fogRadius, deltaTime);
      }
    }

    // Check player vs player collisions
    const playerArray = Array.from(this.players.values());
    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const p1 = playerArray[i];
        const p2 = playerArray[j];

        if (this.physics.canEat(p1, p2)) {
          const result = this.physics.eatPlayer(p1, p2, this.growthCap);
          if (result.massGained > 0) {
            this.emitEvent({
              type: WSMessageType.EVENT,
              eventType: WSEventType.KILL,
              data: { killer: p1.userId, victim: p2.userId },
            });
          }
        } else if (this.physics.canEat(p2, p1)) {
          const result = this.physics.eatPlayer(p2, p1, this.growthCap);
          if (result.massGained > 0) {
            this.emitEvent({
              type: WSMessageType.EVENT,
              eventType: WSEventType.KILL,
              data: { killer: p2.userId, victim: p1.userId },
            });
          }
        }
      }
    }

    // Check player vs pellet collisions
    for (const player of this.players.values()) {
      for (const pellet of this.pellets.values()) {
        if (this.physics.eatPellet(player, pellet, this.growthCap)) {
          this.pellets.delete(pellet.id);
        }
      }
    }

    // Spawn new pellets (tapered during shrink)
    if (this.state === LobbyState.ACTIVE || Math.random() > 0.5) {
      if (this.pellets.size < 500 && Math.random() < 0.1) {
        const rng = this.createSeededRNG();
        this.spawnPellet(rng);
      }
    }
  }

  public getSnapshot(): WSSnapshotMessage {
    return {
      type: WSMessageType.SNAPSHOT,
      tick: this.tick,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        pos: p.pos,
        radius: p.radius,
        mass: p.mass,
        teamNo: p.teamNo,
        isDead: p.isDead,
      })),
      pellets: Array.from(this.pellets.values()).map((p) => ({
        id: p.id,
        pos: p.pos,
        radius: p.radius,
      })),
      fogRadius: this.fogRadius,
      bounties: [], // TODO: implement bounty pings
    };
  }

  private endMatch(): void {
    this.state = LobbyState.SETTLEMENT;
    this.emitEvent({
      type: WSMessageType.EVENT,
      eventType: WSEventType.END,
      data: {},
    });
  }

  public calculateResults(): Array<{
    userId: string;
    placement: number;
    finalMass: number;
    maxMass: number;
    payoutCents: number;
  }> {
    // Sort players by final mass
    const sortedPlayers = Array.from(this.players.values())
      .map((p) => ({
        userId: p.userId,
        finalMass: p.mass,
        maxMass: p.mass, // TODO: track max mass during match
      }))
      .sort((a, b) => b.finalMass - a.finalMass);

    // Calculate pot and rake
    const pot = this.config.buyInCents * this.config.players.length;
    const rake = Math.min(
      Math.floor((pot * this.config.rakeBps) / 10000),
      this.config.rakeCapCents
    );
    const netPot = pot - rake;

    // Calculate payouts based on payout model
    let payouts: number[] = [];

    switch (this.config.payoutModel) {
      case PayoutModel.WINNER_TAKE_ALL:
        payouts = sortedPlayers.map((_, i) => (i === 0 ? netPot : 0));
        break;

      case PayoutModel.TOP_3_LADDER:
        payouts = sortedPlayers.map((_, i) => {
          if (i === 0) return Math.floor(netPot * 0.65);
          if (i === 1) return Math.floor(netPot * 0.25);
          if (i === 2) return Math.floor(netPot * 0.1);
          return 0;
        });
        break;

      case PayoutModel.PROPORTIONAL:
        const totalMass = sortedPlayers.reduce((sum, p) => sum + p.finalMass, 0);
        payouts = sortedPlayers.map((p) =>
          totalMass > 0 ? Math.floor((p.finalMass / totalMass) * netPot) : 0
        );
        break;
    }

    return sortedPlayers.map((p, i) => ({
      userId: p.userId,
      placement: i + 1,
      finalMass: p.finalMass,
      maxMass: p.maxMass,
      payoutCents: payouts[i],
    }));
  }

  public onEvent(callback: (event: any) => void): void {
    this.eventCallbacks.push(callback);
  }

  private emitEvent(event: any): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }

  public getState(): LobbyState {
    return this.state;
  }

  public getPlayers(): Map<string, Player> {
    return this.players;
  }

  public getMatchId(): string {
    return this.matchId;
  }

  public getLobbyId(): string {
    return this.lobbyId;
  }
}
