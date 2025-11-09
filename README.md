# P2P Money-Match Agar Arena

A real-money, provably fair, multiplayer Agar.io-style battle royale game with escrow-based wagering.

## 🚀 Deploy to Website Now

**Want to run this on a live website?** → See **[ACTUALLY_WORKS.md](./ACTUALLY_WORKS.md)**

Three WORKING deployment options:
1. **Render.com** (10 minutes, reads `render.yaml` automatically) ← RECOMMENDED
2. **Replit** (2 minutes, zero config, just click Run) ← EASIEST
3. **Your own VPS** (full control, one-line install script)

**Note**: Railway doesn't handle monorepos well. Use the options above instead!

---

## Features

### Core Gameplay
- **Money-Match System**: Players wager real money ($10, $20, $50) with provably fair outcomes
- **Game Modes**: SOLO (20 players), DUO (10 teams), SQUAD (5 teams)
- **6-Minute Matches**: 4.5min normal phase + 1.5min shrinking fog phase
- **Payout Models**: Winner-Take-All, Top-3 Ladder, or Proportional distribution
- **Authoritative Server**: 30Hz tick rate with server-side physics validation
- **Anti-Snowball**: Growth caps prevent unlimited mass accumulation

### Financial System
- **Custodial Wallets**: PostgreSQL-backed ledger with atomic transactions
- **Escrow System**: Funds locked during matches, released on settlement
- **Rake System**: Configurable house fee (default 8%, capped per table)
- **KYC Integration**: Required for withdrawals, hooks for third-party providers
- **Responsible Gaming**: Self-exclusion, deposit/loss limits, session timers

### Provably Fair
- **Pre-Commitment**: SHA256(seed + nonce) published before match
- **Deterministic RNG**: All spawns and randomness seeded from commitment
- **Post-Match Verification**: Seed revealed, players can verify outcomes
- **Verification API**: `/matches/:id/verify` endpoint reproduces RNG

### Anti-Cheat & Anti-Collusion
- **Server Authority**: Client sends input only, server validates all actions
- **Velocity Checks**: Max speed enforcement, acceleration spike detection
- **Teleport Detection**: Position continuity validation
- **Device Fingerprinting**: Track and link suspicious accounts
- **IP/ASN Analysis**: Prevent same-network collusion in SOLO mode
- **Link Graph**: Track repeated pairings, separate risky players

## Tech Stack

### Backend
- **API Server**: Fastify + TypeScript + JWT auth
- **Game Server**: Socket.io + authoritative physics engine
- **Database**: PostgreSQL (core data) + Redis (lobbies, sessions, queues)
- **Storage**: S3-compatible (MinIO) for match replays

### Frontend
- **Client**: React + TypeScript + Canvas rendering
- **Real-Time**: Socket.io client with client-side prediction

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Observability**: Prometheus + Grafana
- **Error Tracking**: Sentry integration ready

## Project Structure

```
agariogambling/
├── packages/
│   ├── shared/           # Shared types and constants
│   │   └── src/
│   │       └── types/    # Game types, enums, configs
│   ├── server/           # REST API + wallet + lobbies
│   │   └── src/
│   │       ├── db/       # Schema, migrations, pool
│   │       ├── services/ # Auth, wallet, lobby, settlement
│   │       └── index.ts  # Fastify server
│   ├── game-server/      # WebSocket game server
│   │   └── src/
│   │       ├── physics/  # Physics engine
│   │       ├── game/     # Match logic
│   │       └── server.ts # Socket.io server
│   └── client/           # React frontend
│       └── src/
│           ├── pages/    # Home, Game
│           └── contexts/ # Auth context
├── docker-compose.yml
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### Setup

1. **Clone and install dependencies**
```bash
git clone <repo>
cd agariogambling
npm install
```

2. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start infrastructure (Postgres, Redis, MinIO, etc.)**
```bash
npm run docker:up
```

4. **Run database migrations**
```bash
npm run db:migrate
```

5. **Start all services**
```bash
# Terminal 1: API Server
npm run dev:server

# Terminal 2: Game Server
npm run dev:game

# Terminal 3: Client
npm run dev:client
```

6. **Access the application**
- Client: http://localhost:5173
- API: http://localhost:3000
- Game Server: http://localhost:3001
- Grafana: http://localhost:3003 (admin/admin)
- MinIO Console: http://localhost:9001 (minioadmin/minioadmin)

## Development Workflow

### Creating a Match

1. **User Journey**:
   - User signs up / logs in
   - Deposits funds (sandbox mode in dev)
   - Clicks "Quick Join $20"
   - System finds/creates lobby
   - Funds moved to escrow
   - Match starts when lobby fills or countdown expires

2. **Match Lifecycle**:
   ```
   WAITING → COUNTDOWN (10s) → ACTIVE (4.5m) → SUDDEN_SHRINK (1.5m) → SETTLEMENT
   ```

3. **Settlement Flow**:
   - Match ends
   - Server calculates placements & payouts
   - Provably fair seed revealed
   - Payouts processed via wallet service
   - MMR updated
   - Results saved to DB

### API Endpoints

#### Auth
- `POST /auth/signup` - Create account
- `POST /auth/login` - Get JWT token
- `GET /me` - Get user profile

#### Wallet
- `GET /wallet` - Get balance
- `POST /wallet/deposit` - Deposit funds
- `POST /wallet/withdraw` - Withdraw funds (requires KYC)
- `GET /wallet/history` - Transaction history

#### Lobbies
- `GET /lobbies` - List open lobbies
- `POST /lobbies/:id/join` - Join lobby (locks escrow)
- `POST /lobbies/:id/leave` - Leave lobby (refunds escrow)

#### Matches
- `GET /matches/:id` - Get match results
- `GET /matches/:id/verify` - Verify provably fair RNG

#### Admin
- `POST /admin/lobbies` - Create new lobby
- `POST /admin/rake` - Update rake settings
- `POST /admin/geofence` - Update geofencing

### WebSocket Protocol

**Client → Server**:
```typescript
{ type: 'AUTH', token: string }
{ type: 'INPUT', seq: number, axes: {x, y}, boost: boolean, ts: number }
```

**Server → Client**:
```typescript
{ type: 'SNAPSHOT', tick: number, players: [], pellets: [], fogRadius: number }
{ type: 'EVENT', eventType: 'COUNTDOWN|KILL|SHRINK|END', data: {} }
{ type: 'RESULT', placements: [], seed: string, nonce: string, commit: string }
```

## Database Schema

### Core Tables
- `users` - User accounts
- `profiles` - Nicknames, MMR, KYC status
- `wallets` - Available and escrowed balances
- `wallet_tx` - Full transaction ledger
- `lobbies` - Match lobbies
- `lobby_players` - Players in lobbies
- `matches` - Completed matches
- `match_players` - Match results per player

### Anti-Cheat
- `risk_events` - Flagged suspicious actions
- `link_graph` - Player relationship tracking

### Future
- `cosmetics` - Skins, trails, emotes
- `inventory` - User cosmetics
- `seasons` - Competitive seasons

## Testing

### Unit Tests
```bash
npm run test
```

### Acceptance Tests (per spec)
1. **Escrow Integrity**: Pot always equals sum of buy-ins
2. **Provably Fair**: Verifier reproduces pellet map byte-for-byte
3. **No Client Authority**: Modified client inputs rejected 100%
4. **Payout Math**: All models match spec examples
5. **Geofence & KYC**: Blocked countries cannot deposit/join
6. **Growth Cap**: Players capped at buyIn × 5
7. **Rake Cap**: Never exceeds configured cap
8. **Recovery**: Server crash triggers refund, no double-spend

## Production Considerations

### Security Musts
- ✅ All money mutations in single DB transaction with idempotency keys
- ✅ Optimistic locking on wallet updates (version field)
- ✅ Rate limiting on all endpoints
- ⚠️ WAF challenge for suspicious IPs (TODO: Cloudflare)
- ⚠️ Sign WS frames with match token (TODO: HMAC)
- ⚠️ Separate escrow and operating accounts at PSP (TODO)

### Scaling
- **API Server**: Horizontal scaling behind load balancer
- **Game Server**: Stateful, use sticky sessions or Redis pub/sub
- **Database**: Postgres primary + read replicas
- **Redis**: Clustered mode for high availability
- **Storage**: S3 or compatible for replays

### Monitoring
- **Metrics**: Tick delay, packet loss, fill time, early leaves, rake/day
- **Alerts**: Tick drift >50ms for 5m, crash rate >0.5%
- **Fraud**: Win-rate z-score >3, repeated pairings, device sharing

## Compliance

### KYC Requirements
- Required on first withdrawal or reaching deposit threshold
- Geofence restricted regions
- 18+ age verification
- Self-exclusion and loss/deposit limits

### Data Handling
- All sensitive data encrypted at rest
- PII access logged and audited
- GDPR-compliant data export/deletion

## Roadmap

### MVP (Completed)
- ✅ Core game loop (SOLO mode)
- ✅ Wallet + escrow system
- ✅ Provably fair RNG
- ✅ Winner-Take-All payouts
- ✅ Basic anti-cheat
- ✅ Docker development environment

### Post-MVP
- ⚠️ DUO/SQUAD modes
- ⚠️ Replays with playback
- ⚠️ Ladder seasons and leaderboards
- ⚠️ Cosmetics shop
- ⚠️ VIP program / rakeback
- ⚠️ Mobile app (React Native)
- ⚠️ Spectator mode
- ⚠️ Tournaments

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
- GitHub Issues: [Repository Issues]
- Email: support@example.com
- Discord: [Community Server]

## Acknowledgments

- Built on agar.io clone foundation
- Inspired by poker, DFS, and esports wagering models
- Community contributors (see CONTRIBUTORS.md)
