# 🚀 Quick Deploy to Website

**UPDATE**: Railway has issues with monorepos. Use one of these WORKING options instead:

---

## ✅ Option 1: Render.com (RECOMMENDED - Actually Works)

**Best for:** Quick testing, frontend hosting

### Step 1: Deploy Client to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Go to client directory and deploy
cd packages/client
vercel --prod
```

Follow the prompts:
- Login with GitHub/Email
- Set project name: `agar-arena`
- Deploy!

You'll get a URL like: `https://agar-arena.vercel.app`

### Step 2: Deploy Backend to Render

1. Go to https://render.com and sign up
2. Click "New +" → "Web Service"
3. Connect your GitHub repo: `Skriptersz/agariogambling`
4. Configure **API Server**:
   - Name: `agar-api`
   - Build: `npm install && npm run build:shared && npm run build:server`
   - Start: `cd packages/server && node dist/index.js`
   - Add PostgreSQL database (New +)
   - Add Redis (New +)
5. Configure **Game Server** (same steps):
   - Name: `agar-game`
   - Build: `npm install && npm run build:shared && npm run build:game`
   - Start: `cd packages/game-server && node dist/index.js`

### Step 3: Update Environment

In Vercel dashboard, set:
- `VITE_API_URL` = your Render API URL
- `VITE_WS_URL` = your Render Game URL

Done! Your site is live! 🎉

---

## ✅ Option 2: Replit (EASIEST - 2 Minutes)

**Best for:** Quick testing, zero config

1. Go to https://replit.com
2. Click "Import from GitHub"
3. Paste: `https://github.com/Skriptersz/agariogambling`
4. Click "Run"
5. Get instant live URL

Replit auto-detects everything. No configuration needed!

---

## Option 3: Your Own Server (VPS)

**Best for:** Full control, custom domain

### Requirements
- Ubuntu VPS (DigitalOcean, Linode, AWS EC2)
- 4GB RAM minimum
- Domain name

### One-Line Install

```bash
# SSH into your server, then run:
curl -fsSL https://raw.githubusercontent.com/Skriptersz/agariogambling/main/deploy.sh | sudo bash
```

Enter your domain when prompted. Done!

Or manual install:

```bash
# SSH into server
ssh root@your-server-ip

# Clone repo
git clone https://github.com/Skriptersz/agariogambling.git
cd agariogambling

# Run deploy script
chmod +x deploy.sh
sudo ./deploy.sh
```

The script:
- ✅ Installs Node.js, Docker, Nginx
- ✅ Builds all packages
- ✅ Sets up database
- ✅ Gets SSL certificate
- ✅ Starts all services

Your site will be live at your domain with HTTPS!

---

## After Deployment

### Test Your Site

1. Visit your URL
2. Click "Sign Up"
3. Create an account
4. Click "Deposit $50" (sandbox mode)
5. Click "Quick Join $10"
6. Play!

### Check Status

**Vercel:** Check dashboard
**Render:** Check service logs
**VPS:** Run `pm2 status`

### View Logs

**VPS:**
```bash
pm2 logs api-server
pm2 logs game-server
```

**Render:** Click service → Logs tab

### Update Your Site

**Vercel:** Just push to GitHub
**Render:** Auto-deploys on git push
**VPS:**
```bash
cd agariogambling
git pull
npm run build
pm2 restart all
```

---

## Troubleshooting

### Client shows "Cannot connect to server"
- Check `VITE_API_URL` environment variable
- Make sure API server is running
- Check CORS settings

### "WebSocket connection failed"
- Verify `VITE_WS_URL` is correct
- Ensure game server is running
- Check firewall allows WebSocket

### Database connection error
- Verify `DATABASE_URL` is set
- Check database is running
- Run migrations: `npm run db:migrate`

---

## What You Get

- ✅ Live website at your domain
- ✅ Real-time multiplayer gameplay
- ✅ User accounts and authentication
- ✅ Wallet system with escrow
- ✅ Provably fair matches
- ✅ HTTPS/SSL encryption
- ✅ Automatic backups (on managed services)

---

## Cost

### Free Tier (Testing)
- Vercel: Free
- Render: Free tier available
- **Total: $0/month**

### Production
- Vercel: $20/month
- Render (2 services + DB): ~$30/month
- **Total: ~$50/month**

OR

- VPS (DigitalOcean): $24/month
- Managed DB: $15/month
- **Total: ~$40/month**

---

## Need Help?

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide
- See [README.md](./README.md) for full documentation
- Open an issue on GitHub

**Ready to go live? Pick an option above and deploy in minutes!** 🚀
