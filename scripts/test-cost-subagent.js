#!/usr/bin/env node

/**
 * Test Cost Sub-Agent on EHG Application
 */

import CostSubAgent from '../lib/agents/cost-sub-agent';
import path from 'path';
import fs from 'fs';

async function testCost() {
  const agent = new CostSubAgent();
  const basePath = '/mnt/c/_EHG/EHG_Engineer/applications/APP001/codebase';
  
  console.log('💰 Testing Cost Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  console.log('\n📊 Running cost analysis...\n');
  
  try {
    // Run the execute method
    const results = await agent.execute({
      path: basePath,
      supabaseProjectId: 'liapbndqlqxdcgpwntbv'  // From registry.json
    });
    
    console.log('\n💰 Cost Analysis Complete!');
    console.log(`Score: ${results.score}/100`);
    console.log(`Current Monthly Cost: $${results.currentCost?.total || 0}`);
    console.log(`Projected Monthly Cost: $${results.projectedCost?.total || 0}`);
    console.log(`Cost Issues: ${results.issues?.length || 0}`);
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'cost-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('❌ Error during cost analysis:', error.message);
    console.error(error.stack);
  }
}

testCost();