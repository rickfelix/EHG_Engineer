#!/usr/bin/env node

/**
 * Test Database Sub-Agent on EHG Application
 */

import DatabaseSubAgent from '../lib/agents/database-sub-agent.js';
import path from 'path';
import fs from 'fs';

async function testDatabase() {
  const agent = new DatabaseSubAgent();
  const basePath = './applications/APP001/codebase';
  
  console.log('🗄️ Testing Database Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  console.log('\n📊 Running database analysis...\n');
  
  try {
    // Run the execute method
    const results = await agent.execute({
      path: basePath
    });
    
    console.log('\n🗄️ Database Analysis Complete!');
    console.log(`Score: ${results.score}/100`);
    console.log(`Schema Issues: ${results.schema?.issues?.length || 0}`);
    console.log(`Query Issues: ${results.queries?.issues?.length || 0}`);
    console.log(`Migration Issues: ${results.migrations?.issues?.length || 0}`);
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'database-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (_error) {
    console.error('❌ Error during database analysis:', error.message);
    console.error(error.stack);
  }
}

testDatabase();