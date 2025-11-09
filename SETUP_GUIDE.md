# P2P Agar Arena - Setup Guide

## Step-by-Step Installation

### 1. System Requirements

- **Node.js**: v20 or higher
- **Docker**: v24 or higher
- **Docker Compose**: v2 or higher
- **RAM**: 4GB minimum (8GB recommended)
- **Disk**: 5GB free space

### 2. Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd agariogambling

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 3. Configure Environment

Edit `.env` file with your settings:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=agar_arena
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# Redis
REDIS_URL=redis://localhost:6379

# JWT Secret (CHANGE THIS!)
JWT_SECRET=your_very_secret_jwt_key_here

# Ports
PORT=3000
GAME_SERVER_PORT=3001
```

### 4. Start Infrastructure

```bash
# Start Postgres, Redis, MinIO, Prometheus, Grafana
docker-compose up -d

# Wait for services to be healthy (check logs)
docker-compose logs -f
```

### 5. Initialize Database

```bash
# Run migrations to create tables
npm run db:migrate

# Verify tables were created
docker exec -it agar-postgres psql -U postgres -d agar_arena -c "\dt"
```

### 6. Start Development Servers

Open 3 terminal windows:

**Terminal 1 - API Server:**
```bash
npm run dev:server
# Should see: "Server listening on port 3000"
```

**Terminal 2 - Game Server:**
```bash
npm run dev:game
# Should see: "Game server listening on port 3001"
```

**Terminal 3 - Client:**
```bash
npm run dev:client
# Should see: "Local: http://localhost:5173"
```

### 7. Test the Application

1. Open browser to `http://localhost:5173`
2. Click "Sign Up" and create an account
3. Click "Deposit $50 (Sandbox)" to add funds
4. Click "Quick Join $10" to start a match
5. Move mouse to control your cell

## Verification Checklist

- [ ] All Docker containers running (`docker-compose ps`)
- [ ] Database tables created (25+ tables)
- [ ] API server responding (`curl http://localhost:3000/health`)
- [ ] Game server running (check logs)
- [ ] Client loaded in browser
- [ ] Can create account
- [ ] Can deposit funds
- [ ] Can join lobby
- [ ] Can see game rendering

## Troubleshooting

### Port Already in Use

If you see "EADDRINUSE" errors:

```bash
# Find process using port
lsof -i :3000
lsof -i :5173

# Kill the process
kill -9 <PID>
```

### Docker Issues

```bash
# Reset Docker environment
docker-compose down -v
docker-compose up -d

# Re-run migrations
npm run db:migrate
```

### Database Connection Failed

```bash
# Check Postgres is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
docker exec -it agar-postgres psql -U postgres -d agar_arena
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose ps redis

# Test connection
docker exec -it agar-redis redis-cli ping
# Should return: PONG
```

### TypeScript Build Errors

```bash
# Clean and rebuild
rm -rf packages/*/dist
rm -rf packages/*/node_modules
npm install
npm run build
```

### Client Not Loading

```bash
# Check Vite server logs
# Ensure VITE_API_URL and VITE_WS_URL are correct in .env

# Try clearing cache
rm -rf packages/client/node_modules/.vite
npm run dev:client
```

## Development Tips

### Hot Reload

All services support hot reload:
- API/Game servers: nodemon watches TypeScript files
- Client: Vite HMR

Just edit files and save - changes apply automatically.

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Database Queries

```bash
# Connect to Postgres
docker exec -it agar-postgres psql -U postgres -d agar_arena

# Useful queries
SELECT * FROM users;
SELECT * FROM wallets;
SELECT * FROM lobbies;
SELECT * FROM matches ORDER BY created_at DESC LIMIT 10;
```

### Redis Inspection

```bash
# Connect to Redis
docker exec -it agar-redis redis-cli

# List keys
KEYS *

# Get value
GET lobby:abc123:state
```

### Resetting Test Data

```bash
# Drop and recreate database
docker exec -it agar-postgres psql -U postgres -c "DROP DATABASE agar_arena;"
docker exec -it agar-postgres psql -U postgres -c "CREATE DATABASE agar_arena;"

# Re-run migrations
npm run db:migrate
```

## Next Steps

Once setup is complete:

1. Read the [API Documentation](./API.md)
2. Review the [Game Design](./GAME_DESIGN.md)
3. Check the [Contributing Guide](./CONTRIBUTING.md)
4. Explore the codebase starting with `packages/shared/src/types`

## Production Deployment

For production deployment, see [DEPLOYMENT.md](./DEPLOYMENT.md) which covers:
- Environment configuration
- SSL/TLS setup
- CDN and WAF (Cloudflare)
- Kubernetes manifests
- Monitoring and alerting
- Backup and recovery
- Scaling strategies
