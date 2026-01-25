#!/usr/bin/env node

/**
 * GitHub Synchronization Script
 * LEO Protocol v3.1.5 - Wrapper for GitHub sync operations
 */

import SyncManager from '../lib/sync/sync-manager';

async function main() {
  const syncManager = new SyncManager();
  const direction = process.argv[2] || 'pull';
  const appId = process.argv[3];
  
  try {
    const targetApp = appId || await syncManager.getCurrentApp();
    console.log(`GitHub sync (${direction}) for ${targetApp}...`);
    await syncManager.syncGitHub(targetApp, direction);
  } catch (error) {
    console.error('❌ GitHub sync failed:', error.message);
    process.exit(1);
  }
}

main();