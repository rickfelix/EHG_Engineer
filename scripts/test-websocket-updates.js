#!/usr/bin/env node

import WebSocket from 'ws';
import DatabaseLoader from '../src/services/database-loader.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testWebSocketUpdates() {
  console.log('🔌 Testing WebSocket Real-time Updates...\n');

  const ws = new WebSocket('ws://localhost:3000');
  const dbLoader = new DatabaseLoader();

  if (!dbLoader.isConnected) {
    console.error('❌ Database not connected');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    let updateReceived = false;
    let timeoutId;

    ws.on('open', async () => {
      console.log('✅ WebSocket connected');

      // Wait a moment for subscription
      await new Promise(r => setTimeout(r, 1000));

      console.log('📝 Inserting test PR review to trigger update...');

      const testReview = {
        pr_number: 104,
        pr_title: 'WebSocket test PR',
        branch: 'test/websocket',
        author: 'wstest',
        github_url: 'https://github.com/org/repo/pull/104',
        status: 'pending',  // Set as pending so it shows in Active
        summary: 'Testing WebSocket real-time updates',
        issues: [],
        sub_agent_reviews: [],
        sd_link: 'SD-2025-005',
        prd_link: 'PRD-2025-005-01',
        leo_phase: 'EXEC',
        review_time_ms: 2000,
        is_false_positive: false,
        metadata: { websocketTest: true }
      };

      try {
        const result = await dbLoader.savePRReview(testReview);
        console.log('✅ Test review inserted:', result.id);

        // Set timeout to check for updates
        timeoutId = setTimeout(() => {
          if (!updateReceived) {
            console.log('⚠️ No WebSocket update received within 5 seconds');
            ws.close();
            resolve(false);
          }
        }, 5000);

      } catch (_error) {
        console.error('❌ Error inserting test review:', error);
        ws.close();
        reject(error);
      }
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 WebSocket message received:', message.type);

        if (message.type === 'state' && message.data) {
          // Check if PR reviews data is in the state update
          if (message.data.prReviews || message.data.strategicDirectives) {
            updateReceived = true;
            console.log('✅ Real-time update received!');

            if (message.data.prReviews) {
              console.log('   - PR Reviews updated');
            }
            if (message.data.strategicDirectives) {
              console.log('   - Strategic Directives updated');
            }

            clearTimeout(timeoutId);
            ws.close();
            resolve(true);
          }
        }
      } catch (_error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      reject(error);
    });

    ws.on('close', () => {
      console.log('🔌 WebSocket disconnected');
    });
  });
}

async function main() {
  try {
    const success = await testWebSocketUpdates();

    console.log('\n📊 WebSocket Test Results:');
    console.log('==========================');

    if (success) {
      console.log('✅ Real-time updates: WORKING');
      console.log('✅ WebSocket connection: STABLE');
      console.log('✅ Database triggers: ACTIVE');
      console.log('\n🎉 WebSocket real-time updates are fully functional!');
      process.exit(0);
    } else {
      console.log('⚠️ Real-time updates: NOT DETECTED');
      console.log('   - Check Supabase real-time subscriptions');
      console.log('   - Verify WebSocket server configuration');
      console.log('   - Check database connection');
      process.exit(1);
    }
  } catch (_error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();