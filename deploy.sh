#!/bin/bash

# Quick Deploy Script for VPS
# Usage: ./deploy.sh

set -e

echo "🚀 P2P Agar Arena - VPS Deployment Script"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./deploy.sh)"
  exit 1
fi

# Get domain name
read -p "Enter your domain name (e.g., agar.example.com): " DOMAIN

# Install Node.js
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install Nginx
echo "🌐 Installing Nginx..."
apt-get install -y nginx certbot python3-certbot-nginx

# Clone repository (or use existing)
if [ ! -d "agariogambling" ]; then
  echo "📥 Cloning repository..."
  git clone https://github.com/Skriptersz/agariogambling.git
fi

cd agariogambling

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Set up environment
echo "⚙️  Setting up environment..."
cp .env.example .env

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env

# Start infrastructure
echo "🚀 Starting infrastructure (Postgres, Redis)..."
docker-compose up -d postgres redis

# Wait for database
echo "⏳ Waiting for database..."
sleep 10

# Build packages
echo "🔨 Building packages..."
npm run build:shared
npm run build:server
npm run build:game
npm run build:client

# Run migrations
echo "📊 Running database migrations..."
npm run db:migrate

# Install PM2
echo "📦 Installing PM2..."
npm install -g pm2

# Start services
echo "🚀 Starting services..."
cd packages/server && pm2 start dist/index.js --name api-server && cd ../..
cd packages/game-server && pm2 start dist/index.js --name game-server && cd ../..

# Configure Nginx
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/agar-arena <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Client
    location / {
        root $(pwd)/packages/client/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket
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

ln -sf /etc/nginx/sites-available/agar-arena /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl restart nginx

# Get SSL certificate
echo "🔒 Getting SSL certificate..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --register-unsafely-without-email

# Save PM2 processes
pm2 save
pm2 startup

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your site is now live at: https://$DOMAIN"
echo ""
echo "To check status:"
echo "  pm2 status"
echo "  pm2 logs api-server"
echo "  pm2 logs game-server"
echo ""
echo "To update:"
echo "  cd agariogambling"
echo "  git pull"
echo "  npm install"
echo "  npm run build"
echo "  pm2 restart all"
echo ""
