#!/usr/bin/env node

/**
 * Test Design Sub-Agent on EHG Application
 */

import DesignSubAgent from '../lib/agents/design-sub-agent';
import path from 'path';
import fs from 'fs';

async function testDesign() {
  const agent = new DesignSubAgent();
  const basePath = './applications/APP001/codebase';
  
  console.log('🎨 Testing Design Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  console.log('\n📊 Running design & accessibility analysis...\n');
  
  try {
    // Run the execute method
    const results = await agent.execute({
      path: basePath
    });
    
    console.log('\n🎨 Design Analysis Complete!');
    console.log(`Score: ${results.score}/100`);
    console.log(`Accessibility Issues: ${results.accessibility?.issues?.length || 0}`);
    console.log(`Design Issues: ${results.design?.issues?.length || 0}`);
    console.log(`Mobile Issues: ${results.mobile?.issues?.length || 0}`);
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'design-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (_error) {
    console.error('❌ Error during design analysis:', error.message);
    console.error(error.stack);
  }
}

testDesign();