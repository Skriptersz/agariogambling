import { Player, Pellet, Vector2D, GAME_CONFIG } from '@agar/shared';

export class PhysicsEngine {
  /**
   * Calculate mass to radius conversion
   */
  massToRadius(mass: number): number {
    return GAME_CONFIG.MASS_TO_RADIUS_K * Math.sqrt(mass);
  }

  /**
   * Calculate velocity based on mass (bigger = slower)
   */
  calculateMaxVelocity(mass: number): number {
    const baseMass = GAME_CONFIG.INITIAL_PLAYER_MASS;
    const massRatio = mass / baseMass;
    return GAME_CONFIG.MAX_VELOCITY / Math.sqrt(massRatio);
  }

  /**
   * Update player position and velocity based on input
   */
  updatePlayer(player: Player, deltaTime: number): void {
    if (player.isDead) return;

    // Update radius based on mass
    player.radius = this.massToRadius(player.mass);

    // Apply input to velocity
    const maxVel = this.calculateMaxVelocity(player.mass);
    const acceleration = 2.0;

    player.velocity.x += player.inputAxes.x * acceleration * deltaTime;
    player.velocity.y += player.inputAxes.y * acceleration * deltaTime;

    // Apply friction
    player.velocity.x *= GAME_CONFIG.FRICTION;
    player.velocity.y *= GAME_CONFIG.FRICTION;

    // Clamp velocity
    const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
    if (speed > maxVel) {
      player.velocity.x = (player.velocity.x / speed) * maxVel;
      player.velocity.y = (player.velocity.y / speed) * maxVel;
    }

    // Handle boost (dash)
    if (player.boost) {
      const now = Date.now();
      if (now - player.lastBoostTime >= GAME_CONFIG.BOOST_COOLDOWN_MS) {
        const boostMultiplier = 2.0;
        player.velocity.x *= boostMultiplier;
        player.velocity.y *= boostMultiplier;
        player.lastBoostTime = now;
      }
      player.boost = false;
    }

    // Update position
    player.pos.x += player.velocity.x * deltaTime;
    player.pos.y += player.velocity.y * deltaTime;
  }

  /**
   * Check collision between two circles
   */
  checkCollision(
    pos1: Vector2D,
    radius1: number,
    pos2: Vector2D,
    radius2: number
  ): boolean {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < radius1 + radius2;
  }

  /**
   * Check if one player can eat another
   */
  canEat(eater: Player, target: Player): boolean {
    if (eater.isDead || target.isDead) return false;
    if (eater.teamNo > 0 && eater.teamNo === target.teamNo) return false; // same team

    // Must be 15% larger to eat
    return eater.radius > target.radius * GAME_CONFIG.COLLISION_SIZE_RATIO;
  }

  /**
   * Handle player eating another player
   */
  eatPlayer(eater: Player, target: Player, growthCap: number): { massGained: number } {
    if (!this.canEat(eater, target)) {
      return { massGained: 0 };
    }

    if (!this.checkCollision(eater.pos, eater.radius, target.pos, target.radius)) {
      return { massGained: 0 };
    }

    // Transfer mass
    const massToTransfer = target.mass;
    const newMass = Math.min(eater.mass + massToTransfer, growthCap);
    const actualGain = newMass - eater.mass;

    eater.mass = newMass;
    eater.kills++;

    // Kill target
    target.isDead = true;
    target.mass = 0;
    target.radius = 0;

    return { massGained: actualGain };
  }

  /**
   * Handle player eating a pellet
   */
  eatPellet(player: Player, pellet: Pellet, growthCap: number): boolean {
    if (player.isDead || pellet.consumed) return false;

    if (this.checkCollision(player.pos, player.radius, pellet.pos, pellet.radius)) {
      const newMass = Math.min(player.mass + GAME_CONFIG.PELLET_MASS, growthCap);
      player.mass = newMass;
      pellet.consumed = true;
      return true;
    }

    return false;
  }

  /**
   * Apply fog/shrink boundary
   */
  applyFogDamage(player: Player, fogRadius: number, deltaTime: number): void {
    if (player.isDead) return;

    const distance = Math.sqrt(player.pos.x ** 2 + player.pos.y ** 2);
    if (distance > fogRadius) {
      // Player is outside safe zone, apply damage
      const damageRate = 5.0; // mass per second
      player.mass = Math.max(0, player.mass - damageRate * deltaTime);

      if (player.mass <= 0) {
        player.isDead = true;
      }
    }
  }

  /**
   * Keep players within map bounds (hard boundary)
   */
  constrainToMap(player: Player, mapRadius: number): void {
    const distance = Math.sqrt(player.pos.x ** 2 + player.pos.y ** 2);
    if (distance > mapRadius) {
      const angle = Math.atan2(player.pos.y, player.pos.x);
      player.pos.x = Math.cos(angle) * mapRadius;
      player.pos.y = Math.sin(angle) * mapRadius;
      // Bounce back
      player.velocity.x *= -0.5;
      player.velocity.y *= -0.5;
    }
  }

  /**
   * Calculate distance between two points
   */
  distance(pos1: Vector2D, pos2: Vector2D): number {
    const dx = pos2.x - pos1.x;
    const dy = pos2.y - pos1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Normalize a vector
   */
  normalize(v: Vector2D): Vector2D {
    const length = Math.sqrt(v.x * v.x + v.y * v.y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: v.x / length, y: v.y / length };
  }
}
