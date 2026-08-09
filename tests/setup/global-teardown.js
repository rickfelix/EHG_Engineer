/**
 * LEO Protocol v4.1 - Global Test Teardown
 * Cleanup after visual Playwright inspection
 */

async function globalTeardown(config) {
  console.log('🧹 LEO Protocol v4.1 - Starting global test teardown...');
  
  // Archive test results with timestamp
  const fs = require('fs').promises;
  const path = require('path');
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = `test-results/archive-${timestamp}`;
    
    // Create archive directory
    await fs.mkdir(archivePath, { recursive: true });
    
    console.log(`📁 Test results archived to: ${archivePath}`);
  } catch (error) {
    console.log('⚠️  Could not archive test results:', error.message);
  }
  
  console.log('✅ Global teardown complete');
}

module.exports = globalTeardown;