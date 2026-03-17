#!/usr/bin/env node
/**
 * Test EHG Database Connection
 */

import { testConnection } from './lib/supabase-connection.js';

console.log('Testing connection to EHG database...');
testConnection('ehg')
  .then(success => {
    if (success) {
      console.log('✅ Connection successful');
      process.exit(0);
    } else {
      console.error('❌ Connection failed');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });