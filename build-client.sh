#!/bin/bash
set -e

echo "Building shared package..."
cd packages/shared && npm install && npm run build && cd ../..

echo "Building client..."
cd packages/client && npm install && npm run build && cd ../..

echo "Build complete!"
