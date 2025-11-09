#!/bin/bash
set -e

echo "Building shared package..."
cd packages/shared && npm install && npm run build && cd ../..

echo "Building game server..."
cd packages/game-server && npm install && npm run build && cd ../..

echo "Build complete!"
