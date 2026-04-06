#!/bin/bash
# Collector Nation — pull latest code and restart dev server
set -e

echo "🔄 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "✅ Done. Starting dev server..."
npm run dev
