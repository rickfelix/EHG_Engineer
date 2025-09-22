#!/usr/bin/env node

/**
 * Simulate WebSocket client connection to test real-time updates
 */

import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');

ws.on('open', () => {
  console.log('✅ Connected to server WebSocket');
  console.log('👂 Listening for real-time updates...\n');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  if (message.type === 'realtime-update') {
    console.log('📡 REAL-TIME UPDATE RECEIVED!');
    console.log(`   Type: ${message.data.type}`);
    console.log(`   Items: ${message.data.data.length}`);
    console.log('   ✅ Real-time subscriptions are working!\n');
  } else if (message.type === 'state') {
    console.log('📊 Initial state received');
  } else {
    console.log(`📨 Message: ${message.type}`);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('👋 Disconnected from server');
});

// Keep the connection alive
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.ping();
  }
}, 30000);

console.log('🔄 WebSocket client running. Press Ctrl+C to stop.');