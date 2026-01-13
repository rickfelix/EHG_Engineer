#!/usr/bin/env node

/**
 * Test Documentation Sub-Agent on EHG Application
 */

import DocumentationSubAgent from '../lib/agents/documentation-sub-agent';
import path from 'path';
import fs from 'fs';

async function testDocumentation() {
  const agent = new DocumentationSubAgent();
  const basePath = './applications/APP001/codebase';
  
  console.log('📚 Testing Documentation Sub-Agent on EHG Application');
  console.log(`📁 Base Path: ${basePath}`);
  
  // Check if path exists
  if (!fs.existsSync(basePath)) {
    console.error('❌ Path does not exist!');
    return;
  }
  
  console.log('\n📊 Running documentation analysis...\n');
  
  try {
    // Run the execute method
    const results = await agent.execute({
      path: basePath
    });
    
    console.log('\n📚 Documentation Analysis Complete!');
    console.log(`Score: ${results.score}/100`);
    console.log(`README Issues: ${results.readme?.issues?.length || 0}`);
    console.log(`API Doc Issues: ${results.apiDocs?.issues?.length || 0}`);
    console.log(`Code Coverage: ${results.codeCoverage?.percentage || 0}%`);
    
    // Save full report
    const reportPath = path.join(process.cwd(), 'documentation-report-ehg.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n💾 Full report saved to: ${reportPath}`);
    
  } catch (_error) {
    console.error('❌ Error during documentation analysis:', error.message);
    console.error(error.stack);
  }
}

testDocumentation();