#!/usr/bin/env node

/**
 * Test DatabaseLoader directly to mimic server.js
 */

import DatabaseLoader from './src/services/database-loader.js';

async function testDatabaseLoader() {
  console.log('🔍 Testing DatabaseLoader directly');
  console.log('===================================\n');

  try {
    // Initialize the same way server.js does
    const dbLoader = new DatabaseLoader();
    console.log(`Database connected: ${dbLoader.isConnected}`);

    if (!dbLoader.isConnected) {
      console.log('❌ Database not connected, cannot test');
      return;
    }

    console.log('\nCalling getRecentSDIPSubmissions()...');
    const submissions = await dbLoader.getRecentSDIPSubmissions();
    
    console.log(`✅ Success! Retrieved ${submissions.length} submissions`);
    console.log('Submissions:', submissions);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
  }
}

testDatabaseLoader().catch(console.error);