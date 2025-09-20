#!/usr/bin/env node

/**
 * Test Performance Sub-Agent on EHG Application
 */

import PerformanceSubAgent from '../lib/agents/performance-sub-agent';
import path from 'path';
import fs from 'fs';

async function testPerformance() {
  const agent = new PerformanceSubAgent();
  const basePath = '/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase';
  
  console.log('🚀 Testing Performance Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  console.log('\n📊 Running performance analysis...\n');
  
  try {
    // Use the execute method with proper options
    const results = await agent.execute({
      path: basePath,
      dbPath: path.join(basePath, 'supabase'),
      apiUrl: 'http://localhost:3000',  // Will fail gracefully if not running
      url: 'http://localhost:3000'      // For Lighthouse
    });
    
    console.log('\n📊 Performance Analysis Complete!');
    console.log(`Score: ${results.score}/100`);
    console.log(`Issues Found: ${results.issues.length}`);
    console.log(`Optimizations Suggested: ${results.optimizations.length}`);
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'performance-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Error during performance analysis:', error.message);
    console.error(error.stack);
  }
}

testPerformance();