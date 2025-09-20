#!/bin/bash

# Start All EHG Applications
# This script starts both the main EHG application and EHG Engineer

echo "🚀 Starting All EHG Applications..."
echo "===================================="
echo ""

# Function to check if port is in use
check_port() {
    if netstat -tuln 2>/dev/null | grep -q ":$1 "; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Start EHG Engineer Dashboard in background
echo "1️⃣ Starting EHG Engineer Dashboard..."
if check_port 3456; then
    echo "   ⚠️  Port 3456 already in use (EHG Engineer Dashboard may be running)"
else
    cd /mnt/c/_EHG/EHG_Engineer
    if [ ! -d "node_modules" ]; then
        echo "   📦 Installing EHG Engineer dependencies..."
        npm install
    fi
    npm run dashboard &
    echo "   ✅ EHG Engineer Dashboard started on port 3456"
fi

# Wait a moment
sleep 2

# Start Main EHG Application
echo ""
echo "2️⃣ Starting Main EHG Application..."
if check_port 8080; then
    echo "   ⚠️  Port 8080 already in use (Main EHG may be running)"
else
    cd /mnt/c/_EHG/ehg
    if [ ! -d "node_modules" ]; then
        echo "   📦 Installing Main EHG dependencies..."
        npm install
    fi
    echo "   ✅ Starting Main EHG on port 8080"
    npm run dev -- --port 8080 &
fi

echo ""
echo "====================================="
echo "🎉 All EHG Applications Started!"
echo ""
echo "📍 Main EHG Application: http://localhost:8080"
echo "📍 EHG Engineer Dashboard: http://localhost:3456"
echo "📍 EHG Engineer Server: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all applications"
echo "====================================="

# Wait for user interrupt
wait