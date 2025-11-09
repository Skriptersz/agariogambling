# Railway Deployment Guide

## The Problem

Railway can't auto-detect monorepo structures. You need to configure each service manually.

## Solution: Create 3 Separate Services

### Step 1: Create Database Services

1. Go to Railway dashboard
2. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
   - Railway will create it automatically
3. Click **"New"** → **"Database"** → **"Add Redis"**
   - Railway will create it automatically

### Step 2: Create API Server

1. Click **"New"** → **"GitHub Repo"**
2. Select `Skriptersz/agariogambling`
3. Click **"Add variables"** and set:
   ```
   NODE_ENV=production
   PORT=3000
   ```
4. Click **"Settings"** tab:
   - **Root Directory**: Leave empty (use root)
   - **Build Command**: `./build-server.sh`
   - **Start Command**: `./start-server.sh`
5. Click **"Variables"** tab and connect database:
   - Click **"New Variable"** → **"Add Reference"**
   - Select `DATABASE_URL` from PostgreSQL
   - Select `REDIS_URL` from Redis
6. Add **custom variable**:
   - `JWT_SECRET` = `<generate a random string>`
7. Click **"Deploy"**

### Step 3: Create Game Server

1. Click **"New"** → **"GitHub Repo"** (same repo again)
2. In **Settings**:
   - **Root Directory**: Leave empty
   - **Build Command**: `./build-game.sh`
   - **Start Command**: `./start-game.sh`
3. Add variables:
   ```
   NODE_ENV=production
   GAME_SERVER_PORT=3001
   ```
4. Connect Redis:
   - Add reference to `REDIS_URL`
5. Click **"Deploy"**

### Step 4: Deploy Client to Vercel

Railway doesn't do static hosting well. Use Vercel for the client:

```bash
cd packages/client
vercel --prod
```

Set environment variables in Vercel:
- `VITE_API_URL` = Your Railway API URL
- `VITE_WS_URL` = Your Railway Game URL

### Step 5: Run Database Migration

Once API server is deployed:

1. Click on API Server service
2. Click **"Settings"** → **"Deploy Logs"**
3. Once running, click on the service
4. Click the **three dots** → **"Service Settings"** → **"Deployments"**
5. Click **"View Logs"** on latest deployment
6. Go to **Settings** → **"Custom Start Command"**
7. Temporarily change to: `npm run db:migrate && ./start-server.sh`
8. Let it deploy once to create tables
9. Change back to: `./start-server.sh`

## Alternative: Use Render Instead

Railway is complicated for monorepos. **Use Render.com instead** - it's much easier.

See `render.yaml` - it's already configured. Just:

1. Go to https://render.com
2. Click **"New"** → **"Blueprint"**
3. Connect repo
4. It reads `render.yaml` and creates everything automatically

## Alternative: Vercel for Everything

Actually, the **easiest** is Vercel + serverless functions:

1. Deploy client: `vercel --prod`
2. API as serverless: Configure in `vercel.json`
3. Game server: Use Socket.io on serverless (or separate Render service)

## Simplest Working Setup

**Use this combo:**
- **Client**: Vercel (easiest, free tier)
- **API + Game**: Render.com with `render.yaml` (auto-configures)
- **Database**: Render PostgreSQL + Redis

Total time: 10 minutes, mostly automated.

## Even Simpler: Replit

Actually the EASIEST:

1. Go to replit.com
2. Import from GitHub
3. Click Run
4. Done

Replit auto-detects everything and handles the monorepo.
