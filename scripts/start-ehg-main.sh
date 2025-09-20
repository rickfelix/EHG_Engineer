#!/bin/bash

# Start Main EHG Application
# This script starts the primary EHG application on port 8080

echo "🚀 Starting Main EHG Application..."
echo "=================================="

# Navigate to EHG directory
cd /mnt/c/_EHG/ehg

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the development server on port 8080
echo "✨ Starting EHG on port 8080..."
echo "📍 Access at: http://localhost:8080"
npm run dev -- --port 8080