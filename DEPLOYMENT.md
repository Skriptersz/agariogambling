# Deployment Guide - Running on a Website

This guide covers deploying the P2P Agar Arena to production hosting platforms.

## Architecture Overview

The system requires 3 components to be deployed:

1. **Client (Static Frontend)** → Vercel/Netlify/Cloudflare Pages
2. **API Server (REST API)** → Render/Railway/Fly.io
3. **Game Server (WebSocket)** → Render/Railway/Fly.io
4. **Database & Redis** → Managed services

---

## Option 1: Quick Deploy (Recommended for Testing)

### Deploy to Vercel + Render (Free Tier)

#### Step 1: Deploy Client to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy client
cd packages/client
vercel --prod
```

When prompted:
- Set up project: Yes
- Which scope: Your account
- Link to existing project: No
- Project name: agar-arena
- Directory: `./` (current)
- Override settings: No

**Set environment variables in Vercel dashboard:**
- `VITE_API_URL`: `https://your-api-server.onrender.com`
- `VITE_WS_URL`: `https://your-game-server.onrender.com`

#### Step 2: Deploy Backend to Render

1. **Push code to GitHub** (already done)

2. **Create Render account**: https://render.com

3. **Create PostgreSQL database**:
   - Click "New +" → "PostgreSQL"
   - Name: `agar-postgres`
   - Plan: Free
   - Click "Create Database"
   - Copy the "Internal Database URL"

4. **Create Redis instance**:
   - Click "New +" → "Redis"
   - Name: `agar-redis`
   - Plan: Free
   - Click "Create Redis"

5. **Deploy API Server**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Name: `agar-api-server`
   - Root Directory: `.`
   - Environment: `Node`
   - Build Command: `npm install && npm run build:shared && npm run build:server`
   - Start Command: `npm run start:server`
   - Plan: Free
   - Add environment variables:
     - `NODE_ENV`: `production`
     - `DATABASE_URL`: [paste PostgreSQL URL]
     - `REDIS_URL`: [paste Redis URL]
     - `JWT_SECRET`: [generate random string]
     - `PORT`: `3000`
   - Click "Create Web Service"

6. **Deploy Game Server**:
   - Repeat above steps
   - Name: `agar-game-server`
   - Build Command: `npm install && npm run build:shared && npm run build:game`
   - Start Command: `npm run start:game`
   - Environment variables:
     - `NODE_ENV`: `production`
     - `REDIS_URL`: [paste Redis URL]
     - `GAME_SERVER_PORT`: `3001`

7. **Run Database Migration**:
   - In API Server dashboard → "Shell"
   - Run: `npm run db:migrate`

#### Step 3: Update Client Environment

Go back to Vercel dashboard and update:
- `VITE_API_URL`: `https://agar-api-server.onrender.com`
- `VITE_WS_URL`: `https://agar-game-server.onrender.com`

Redeploy client: `vercel --prod`

---

## Option 2: Deploy to Railway (All-in-One)

Railway provides a simpler deployment:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up
```

Configure in Railway dashboard:
1. Add PostgreSQL plugin
2. Add Redis plugin
3. Create 3 services: client, api-server, game-server
4. Set environment variables
5. Deploy

---

## Option 3: VPS Deployment (Full Control)

For deploying to your own VPS (DigitalOcean, AWS EC2, Linode):

### Prerequisites
- Ubuntu 22.04 VPS with 4GB RAM
- Domain name pointing to VPS IP
- SSH access

### Setup Script

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Nginx
apt-get install -y nginx certbot python3-certbot-nginx

# Clone repository
git clone https://github.com/Skriptersz/agariogambling.git
cd agariogambling

# Install dependencies
npm install

# Start infrastructure (Postgres, Redis)
docker-compose up -d postgres redis minio

# Build all packages
npm run build

# Run migrations
npm run db:migrate

# Install PM2 for process management
npm install -g pm2

# Start services with PM2
pm2 start packages/server/dist/index.js --name api-server
pm2 start packages/game-server/dist/index.js --name game-server

# Build client
npm run build:client

# Configure Nginx
cat > /etc/nginx/sites-available/agar-arena <<EOF
server {
    listen 80;
    server_name yourdomain.com;

    # Client (static files)
    location / {
        root /root/agariogambling/packages/client/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API Server
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # Game Server (WebSocket)
    location /socket.io {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/agar-arena /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Get SSL certificate
certbot --nginx -d yourdomain.com

# Save PM2 processes
pm2 save
pm2 startup
```

---

## Environment Variables Reference

### Client (Vercel/Static Host)
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=https://game.yourdomain.com
```

### API Server
```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/agar_arena
REDIS_URL=redis://host:6379
JWT_SECRET=your-super-secret-key-change-this
CORS_ORIGIN=https://yourdomain.com
SENTRY_DSN=your-sentry-dsn
```

### Game Server
```bash
NODE_ENV=production
GAME_SERVER_PORT=3001
REDIS_URL=redis://host:6379
CORS_ORIGIN=https://yourdomain.com
```

---

## Database Hosting Options

### Free/Cheap Options:
- **Render PostgreSQL**: Free tier (expires after 90 days)
- **Railway PostgreSQL**: $5/month
- **Supabase**: Free tier with limits
- **Neon**: Free tier serverless Postgres

### Redis Hosting:
- **Render Redis**: Free tier
- **Upstash**: Free tier serverless Redis
- **Redis Cloud**: Free 30MB

---

## Post-Deployment Checklist

- [ ] Client loads at your domain
- [ ] Can create account (test signup)
- [ ] Can deposit funds (sandbox mode)
- [ ] Can join lobby
- [ ] Game connects via WebSocket
- [ ] Can see real-time gameplay
- [ ] Check browser console for errors
- [ ] Test on mobile device
- [ ] Verify SSL certificate
- [ ] Set up monitoring (Sentry)
- [ ] Configure backups (database)

---

## Monitoring & Maintenance

### Logs
```bash
# Render: Check logs in dashboard
# VPS: pm2 logs
pm2 logs api-server
pm2 logs game-server
```

### Database Backups
```bash
# VPS: Daily backups with cron
0 2 * * * pg_dump agar_arena > /backups/agar_$(date +\%Y\%m\%d).sql
```

### Updates
```bash
# VPS deployment
git pull
npm install
npm run build
pm2 restart all
```

---

## Troubleshooting

### Client can't connect to API
- Check CORS settings in API server
- Verify `VITE_API_URL` is correct
- Check API server logs

### WebSocket connection fails
- Ensure WebSocket support on host
- Check `VITE_WS_URL` is correct
- Verify game server is running

### Database connection fails
- Check `DATABASE_URL` format
- Verify network access from server to DB
- Check PostgreSQL is running

### "502 Bad Gateway"
- Server not running or crashed
- Check logs: `pm2 logs`
- Restart: `pm2 restart all`

---

## Cost Estimate

### Free Tier (Testing)
- Vercel: Free
- Render PostgreSQL: Free (90 days)
- Render Redis: Free
- Render Web Services: Free (2 services)
- **Total: $0/month** (limitations apply)

### Production (Paid)
- Vercel Pro: $20/month
- Render PostgreSQL: $7/month
- Render Redis: $10/month
- Render Web Services: $7/month × 2 = $14/month
- **Total: ~$51/month**

### VPS Option
- DigitalOcean Droplet (4GB): $24/month
- Managed PostgreSQL: $15/month
- Managed Redis: $10/month
- **Total: ~$49/month**

---

## Next Steps

Once deployed:
1. Test all features thoroughly
2. Set up monitoring (Sentry, Prometheus)
3. Configure KYC provider
4. Integrate real payment processor
5. Set up automated backups
6. Load test with multiple concurrent users
7. Security audit before handling real money

Need help? Check the troubleshooting section or open an issue on GitHub.
