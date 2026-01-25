#!/usr/bin/env node

/**
 * Sync Manager CLI Wrapper
 * LEO Protocol v3.1.5 - Full application synchronization
 */

import SyncManager from '../lib/sync/sync-manager';

async function main() {
  const syncManager = new SyncManager();
  const appId = process.argv[2];
  
  try {
    if (appId === 'all') {
      await syncManager.syncAll();
    } else {
      const targetApp = appId || await syncManager.getCurrentApp();
      await syncManager.fullSync(targetApp);
    }
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

main();