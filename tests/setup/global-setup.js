/**
 * LEO Protocol v4.1 - Global Test Setup
 * Prepares environment for visual Playwright inspection
 */

async function globalSetup(config) {
  console.log('🚀 LEO Protocol v4.1 - Starting global test setup...');
  
  // Ensure test directories exist
  const fs = require('fs').promises;
  const path = require('path');
  
  const dirs = [
    'test-results',
    'test-results/html-report', 
    'test-results/screenshots',
    'test-results/videos',
    'test-results/traces'
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(path.join(process.cwd(), dir), { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  // Check if dashboard server is running
  try {
    const response = await fetch('http://localhost:3456/health');
    console.log('✅ Dashboard server is running');
  } catch (error) {
    console.log('⚠️  Dashboard server not responding - tests may fail');
  }
  
  console.log('✅ Global setup complete');
}

module.exports = globalSetup;