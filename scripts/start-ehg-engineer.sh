#!/bin/bash

# Start EHG Engineer (LEO Protocol Framework)
# This script starts the EHG Engineer dashboard and server

echo "🔧 Starting EHG Engineer (LEO Protocol)..."
echo "========================================="

# Navigate to EHG Engineer directory
cd /mnt/c/_EHG/EHG_Engineer

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the dashboard
echo "✨ Starting EHG Engineer Dashboard on port 3456..."
echo "📍 Dashboard: http://localhost:3456"
echo "📍 Server: http://localhost:3000"
npm run dashboard