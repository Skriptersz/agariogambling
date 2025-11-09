# DEPLOYMENT THAT ACTUALLY WORKS

Forget Railway - it's a pain for monorepos. Here's what ACTUALLY works:

---

## ✅ OPTION 1: Render.com (RECOMMENDED - Actually Works)

### Why Render?
- Reads `render.yaml` and auto-configures everything
- Free tier available
- Handles monorepos properly
- Takes 10 minutes

### Steps:

1. **Go to https://render.com** and sign up

2. **Click "New +" → "Blueprint"**

3. **Connect your GitHub**: `Skriptersz/agariogambling`

4. **Render reads `render.yaml` and creates:**
   - PostgreSQL database
   - Redis database
   - API server
   - Game server

5. **Wait 5 minutes for build**

6. **Run migration** (one time):
   - Click on `agar-api` service
   - Click "Shell" tab
   - Run: `cd packages/server && node dist/db/migrate.js`

7. **Deploy client to Vercel**:
   ```bash
   cd packages/client
   npm install -g vercel
   vercel --prod
   ```

   Set environment variables in Vercel dashboard:
   - `VITE_API_URL`: `https://agar-api.onrender.com`
   - `VITE_WS_URL`: `https://agar-game.onrender.com`

8. **DONE!** Visit your Vercel URL

---

## ✅ OPTION 2: Replit (EASIEST - 2 Minutes)

### Why Replit?
- Auto-detects everything
- Free tier
- Instant deployment
- No configuration needed

### Steps:

1. Go to https://replit.com

2. Click "Create Repl"

3. Click "Import from GitHub"

4. Paste: `https://github.com/Skriptersz/agariogambling`

5. Click "Import"

6. Replit auto-detects the monorepo

7. Click "Run"

8. **DONE!** Replit gives you a live URL

Note: You'll need to configure the database separately or use Replit's database.

---

## ✅ OPTION 3: Vercel + Serverless Functions

### Deploy everything to Vercel:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

The `vercel.json` is already configured to:
- Serve the React client as static files
- (You'll need to add API routes manually or use separate Render for backend)

---

## ✅ OPTION 4: Single VPS (Most Reliable)

### For $5/month on DigitalOcean/Linode:

```bash
# Create Ubuntu 22.04 droplet

# SSH in
ssh root@your-ip

# Clone repo
git clone https://github.com/Skriptersz/agariogambling.git
cd agariogambling

# Run automated script
chmod +x deploy.sh
./deploy.sh
```

Enter your domain when prompted.

The script automatically:
- ✅ Installs Node, Docker, Nginx
- ✅ Builds everything
- ✅ Sets up database
- ✅ Gets SSL certificate
- ✅ Starts services with PM2

Visit https://yourdomain.com - **IT WORKS!**

---

## Why These Work (and Railway doesn't):

**Render**: Explicitly designed for monorepos, reads `render.yaml`

**Replit**: Smart detection, handles complex projects

**VPS**: Full control, no platform quirks

**Railway**: Bad monorepo support, needs manual per-service setup

---

## My Recommendation:

**For testing**: Use Replit (2 minutes, free)

**For production**: Use Render + Vercel ($0-50/month, reliable)

**For full control**: Use VPS ($5-40/month, you own it)

---

## Test It's Working:

1. Visit your URL
2. Sign up for account
3. Deposit $50 (sandbox)
4. Click "Quick Join $10"
5. Game should load and be playable

---

## If You Still Want Railway:

See `RAILWAY.md` for the manual setup (requires creating 3 separate services manually in the dashboard).

---

**Bottom line**: Use Render.com with the Blueprint feature. It's literally 3 clicks and reads the `render.yaml` automatically.
