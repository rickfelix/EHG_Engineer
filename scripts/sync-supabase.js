#!/usr/bin/env node

/**
 * Supabase Synchronization Script
 * LEO Protocol v3.1.5 - Wrapper for Supabase sync operations
 */

import SyncManager from '../lib/sync/sync-manager';

async function main() {
  const syncManager = new SyncManager();
  const direction = process.argv[2] || 'pull';
  const appId = process.argv[3];
  
  try {
    const targetApp = appId || await syncManager.getCurrentApp();
    console.log(`Supabase sync (${direction}) for ${targetApp}...`);
    await syncManager.syncSupabase(targetApp, direction);
  } catch (error) {
    console.error('❌ Supabase sync failed:', error.message);
    process.exit(1);
  }
}

main();